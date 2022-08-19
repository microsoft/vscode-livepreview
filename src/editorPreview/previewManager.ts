import { Disposable } from '../utils/dispose';
import * as vscode from 'vscode';
import { Settings, SettingUtil } from '../utils/settingsUtil';
import {
	DONT_SHOW_AGAIN,
	INIT_PANEL_TITLE,
	OUTPUT_CHANNEL_NAME,
} from '../utils/constants';
import TelemetryReporter from 'vscode-extension-telemetry';
import { ConnectionManager } from '../connectionInfo/connectionManager';
import { PathUtil } from '../utils/pathUtil';
import { BrowserPreview } from './browserPreview';
import { Connection } from '../connectionInfo/connection';
import { EndpointManager } from '../infoManagers/endpointManager';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();
export class PreviewManager extends Disposable {
	private readonly _outputChannel: vscode.OutputChannel;
	public previewActive = false;
	public currentPanel: BrowserPreview | undefined;
	private _notifiedAboutLooseFiles = false;
	private _currentTimeout: NodeJS.Timeout | undefined;
	private _runTaskWithExternalPreview;

	public get runTaskWithExternalPreview() {
		return this._runTaskWithExternalPreview;
	}
	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _reporter: TelemetryReporter,
		private readonly _connectionManager: ConnectionManager,
		private readonly _endpointManager: EndpointManager,
		private readonly _serverExpired: () => void
	) {
		super();
		this._outputChannel =
			vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);

		this._runTaskWithExternalPreview =
			SettingUtil.GetConfig(_extensionUri).runTaskWithExternalPreview;

		vscode.workspace.onDidChangeConfiguration((e) => {
			this._runTaskWithExternalPreview = SettingUtil.GetConfig(
				this._extensionUri
			).runTaskWithExternalPreview;
		});
	}

	private readonly _onShouldCloseServer = this._register(
		new vscode.EventEmitter<void>()
	);

	public readonly onConnected = this._onShouldCloseServer.event;

	/**
	 * @description notify the user that they are opening a file outside the current workspace(s).
	 */
	private notifyLooseFileOpen(): void {
		/* __GDPR__
			"preview.fileOutOfWorkspace" : {}
		*/
		this._reporter.sendTelemetryEvent('preview.fileOutOfWorkspace');
		if (
			!this._notifiedAboutLooseFiles &&
			SettingUtil.GetConfig(this._extensionUri).notifyOnOpenLooseFile
		) {
			vscode.window
				.showWarningMessage(
					localize(
						'notPartOfWorkspace',
						'Previewing a file that is not a child of the server root. To see fully correct relative file links, please open a workspace at the project root.'
					),
					DONT_SHOW_AGAIN
				)
				.then((selection: vscode.MessageItem | undefined) => {
					if (selection == DONT_SHOW_AGAIN) {
						SettingUtil.UpdateSettings(Settings.notifyOnOpenLooseFile, false);
					}
				});
		}
		this._notifiedAboutLooseFiles = true;
	}

	/**
	 * Transforms non-relative files into a path that can be used by the server.
	 * @param {boolean} relative whether the path is relative (if not relative, returns `file`).
	 * @param {string} file the path to potentially transform.
	 * @returns {string} the transformed path if the original `file` was realtive.
	 */
	private transformNonRelativeFile(
		relative: boolean,
		file: string,
		connection: Connection | undefined
	): string {
		if (!connection?.workspace) {
			this.notifyLooseFileOpen();
			file = this._endpointManager.encodeLooseFileEndpoint(file);
		} else if (!relative && connection) {
			file = connection.getFileRelativeToWorkspace(file) ?? '';
		}
		return file;
	}

	/**
	 * Actually launch the embedded browser preview (caller guarantees that the server has started.)
	 * @param {string} file the filesystem path to preview.
	 * @param {boolean} relative whether the path is relative.
	 * @param {vscode.WebviewPanel | undefined} panel the webview panel to reuse if defined.
	 */
	public launchFileInEmbeddedPreview(
		file: string,
		relative: boolean,
		panel: vscode.WebviewPanel | undefined,
		connection: Connection
	) {
		file = this.transformNonRelativeFile(relative, file, connection);
		// If we already have a panel, show it.
		if (this.currentPanel) {
			this.currentPanel.reveal(vscode.ViewColumn.Beside, file, connection);
			return;
		}

		if (!panel) {
			// Otherwise, create a new panel.
			panel = vscode.window.createWebviewPanel(
				BrowserPreview.viewType,
				INIT_PANEL_TITLE,
				vscode.ViewColumn.Beside,
				{
					...this.getWebviewOptions(),
					...this.getWebviewPanelOptions(),
				}
			);
		}

		this.startEmbeddedPreview(panel, file, connection);
	}

	/**
	 * Actually launch the external browser preview (caller guarantees that the server has started.)
	 * @param {string} file the filesystem path to preview.
	 * @param {boolean} relative whether the path is relative.
	 * @param {boolean} debug whether we are opening in a debug session.
	 */
	public launchFileInExternalBrowser(
		file: string,
		relative: boolean,
		debug: boolean,
		connection: Connection
	) {
		const relFile = PathUtil.ConvertToUnixPath(
			this.transformNonRelativeFile(relative, file, connection)
		);

		const url = `http://${connection.host}:${connection.httpPort}${relFile}`;
		if (debug) {
			vscode.commands.executeCommand('extension.js-debug.debugLink', url);
		} else {
			// will already resolve to local address
			vscode.env.openExternal(vscode.Uri.parse(url));
		}
	}

	/**
	 * Handles opening the embedded preview and setting up its listeners.
	 * After a browser preview is closed, the server will close if another browser preview has not opened after a period of time (configurable in settings)
	 * or if a task is not runnning. Because of this, a timer is triggerred upon webview (embedded preview) disposal/closing.
	 * @param {vscode.WebviewPanel} panel the panel to use to open the preview.
	 * @param {string} file the path to preview relative to index (should already be encoded).
	 */
	private startEmbeddedPreview(
		panel: vscode.WebviewPanel,
		file: string,
		connection: Connection
	) {
		if (this._currentTimeout) {
			clearTimeout(this._currentTimeout);
		}

		this.currentPanel = this._register(
			new BrowserPreview(
				file,
				connection,
				panel,
				this._extensionUri,
				this._reporter,
				this._connectionManager,
				this._outputChannel
			)
		);

		this.previewActive = true;

		this._register(
			this.currentPanel.onDispose(() => {
				this.currentPanel = undefined;
				const closeServerDelay = SettingUtil.GetConfig(
					this._extensionUri
				).serverKeepAliveAfterEmbeddedPreviewClose;
				this._currentTimeout = setTimeout(() => {
					this._serverExpired();

					this.previewActive = false;
				}, Math.floor(closeServerDelay * 1000 * 60));
			})
		);
	}

	/**
	 * @returns {WebviewOptions} the webview options to allow us to load the files we need in the webivew.
	 */
	public getWebviewOptions(): vscode.WebviewOptions {
		const options = {
			// Enable javascript in the webview
			enableScripts: true,

			localResourceRoots: [
				vscode.Uri.joinPath(this._extensionUri, 'media'),
				vscode.Uri.joinPath(
					this._extensionUri,
					'node_modules',
					'@vscode',
					'codicons',
					'dist'
				),
			],
		};
		return options;
	}
	/**
	 * @returns {vscode.WebviewPanelOptions} the webview panel options to allow it to always retain context.
	 */
	private getWebviewPanelOptions(): vscode.WebviewPanelOptions {
		return {
			retainContextWhenHidden: true,
		};
	}
}
