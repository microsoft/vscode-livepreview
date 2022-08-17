import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
// import { BrowserPreview } from './editorPreview/browserPreview';
import { Disposable } from './utils/dispose';
import { ServerManager } from './server/serverManager';
import {
	INIT_PANEL_TITLE,
	DONT_SHOW_AGAIN,
	OUTPUT_CHANNEL_NAME,
} from './utils/constants';
import {
	ServerStartedStatus,
	ServerTaskProvider,
} from './task/serverTaskProvider';
import {
	Settings,
	SETTINGS_SECTION_ID,
	SettingUtil,
} from './utils/settingsUtil';
import TelemetryReporter from 'vscode-extension-telemetry';
import { EndpointManager } from './infoManagers/endpointManager';
// import { WorkspaceManager } from './infoManagers/workspaceManager';
import { ConnectionManager } from './connectionInfo/connectionManager';
import { PathUtil } from './utils/pathUtil';
import { Connection } from './connectionInfo/connection';
import { PreviewManager } from './editorPreview/previewManager';
import { StatusBarNotifier } from './server/serverUtils/statusBarNotifier';

const localize = nls.loadMessageBundle();


/**
 * @description the server log item that is sent from the HTTP server to the server logging task.
 */
export interface serverMsg {
	method: string;
	url: string;
	status: number;
}

/**
 * @description the info for launching a preview, used after a server is launched.
 */
export interface launchInfo {
	external: boolean;
	file: string;
	relative: boolean;
	debug: boolean;
	panel?: vscode.WebviewPanel;
	connection: Connection;
}
export class ServerGrouping extends Disposable {


	private readonly _onClose = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onClose = this._onClose.event;
	private readonly _server: ServerManager;
	private _pendingLaunchInfo: launchInfo | undefined;

	public get port(): number | undefined {
		return this._connection.httpPort;
	}
	public get workspace(): vscode.WorkspaceFolder | undefined {
		return this._connection.workspace;
	}

	public get workspacePath(): string | undefined {
		return this._connection.workspacePath;
	}
	// on each new request processed by the HTTP server, we should
	// relay the information to the task terminal for logging.
	private readonly _onNewReqProcessed = this._register(
		new vscode.EventEmitter<serverMsg>()
	);
	public readonly onNewReqProcessed = this._onNewReqProcessed.event;

	// private readonly _onShouldOpenPreview = this._register(
	// 	new vscode.EventEmitter<launchInfo>()
	// );

	// public readonly onShouldOpenPreview = this._onShouldOpenPreview.event;

	// public get taskRunning() {
	// 	return this._serverTaskProvider.isRunning;
	// }

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _reporter: TelemetryReporter,
		private readonly _connection: Connection,
		private readonly _endpointManager: EndpointManager,
		private readonly _previewManager: PreviewManager,
		private readonly _statusBar: StatusBarNotifier,
		private readonly _serverTaskProvider: ServerTaskProvider,
		userDataDir: string | undefined
	) {
		super();



		this._server = this._register(
			new ServerManager(
				_extensionUri,
				_reporter,
				this._endpointManager,
				this._connection,
				this._statusBar,
				userDataDir
			)
		);


		this._register(
			this._server.onNewReqProcessed((e) => {
				this._serverTaskProvider.sendServerInfoToTerminal(e);
			})
		);

		this._connection.onConnected((e) => {
			this._serverTaskProvider.serverStarted(
				e.httpURI,
				ServerStartedStatus.JUST_STARTED
			);

			if (this._pendingLaunchInfo) {
				if (this._pendingLaunchInfo.external) {
					this._previewManager.launchFileInExternalBrowser(
						this._pendingLaunchInfo.file,
						this._pendingLaunchInfo.relative,
						this._pendingLaunchInfo.debug,
						this._connection
					);
				} else {
					this._previewManager.launchFileInEmbeddedPreview(
						this._pendingLaunchInfo.file,
						this._pendingLaunchInfo.relative,
						this._pendingLaunchInfo.panel,
						this._connection
					);
				}

				this._pendingLaunchInfo = undefined;
			}
		});

		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(SETTINGS_SECTION_ID)) {
				this._server.updateConfigurations();
				this._connection.pendingPort = SettingUtil.GetConfig(
					this._extensionUri
				).portNumber;
				this._connection.pendingHost = SettingUtil.GetConfig(
					this._extensionUri
				).hostIP;
			}
		});

		this._connection.onConnected((e) => {
			this._serverTaskProvider.serverStarted(
				e.httpURI,
				ServerStartedStatus.JUST_STARTED
			);
		});
	}

	dispose() {
		this._server.closeServer();
	}

	/**
	 * Opens the preview in an external browser.
	 * @param {string} file the filesystem path to open in the preview.
	 * @param {boolean} relative whether the path was absolute or relative to the current workspace.
	 * @param {boolean} debug whether or not to run in debug mode.
	 */
	public showPreviewInBrowser(
		file = '/',
		relative = true,
		debug = false
	): void {
		if (!this._serverTaskProvider.isRunning) {
			if (!this._server.isRunning) {
				// set the pending launch info, which will trigger once the server starts in `launchFileInExternalPreview`
				this._pendingLaunchInfo = {
					external: true,
					file: file,
					relative: relative,
					debug: debug,
					connection: this._connection,
				};
			} else {
				this._previewManager.launchFileInExternalBrowser(
					file,
					relative,
					debug,
					this._connection
				);
			}
			if (
				vscode.workspace.workspaceFolders &&
				vscode.workspace.workspaceFolders.length > 0 &&
				this._previewManager.runTaskWithExternalPreview
			) {
				this._serverTaskProvider.extRunTask(
					SettingUtil.GetConfig(this._extensionUri)
						.browserPreviewLaunchServerLogging
				);
			} else {
				// global tasks are currently not supported, just turn on server in this case.
				const serverOn = this.openServer();

				if (!serverOn) {
					return;
				}
			}
		} else {
			this._previewManager.launchFileInExternalBrowser(
				file,
				relative,
				debug,
				this._connection
			);
		}
	}

	/**
	 * Start the server.
	 * @param {boolean} fromTask whether the request is from a task; if so, it requires a reply to the terminal
	 * @returns {boolean} whether or not the server started successfully.
	 */
	public openServer(fromTask = false): boolean {
		if (!this._server.isRunning) {
			return this._server.openServer(this._connection.httpPort);
		} else if (fromTask) {
			this._connection.resolveExternalHTTPUri().then((uri) => {
				this._serverTaskProvider.serverStarted(
					uri,
					ServerStartedStatus.STARTED_BY_EMBEDDED_PREV
				);
			});
		}

		return true;
	}

	/**
	 * Stops the server.
	 * NOTE: the caller is reponsible for only calling this if nothing is using the server.
	 * @returns {boolean} whether or not the server stopped successfully.
	 */
	public closeServer(): boolean {
		if (this._server.isRunning) {
			this._server.closeServer();
			this._onClose.fire();
			if (
				this._previewManager.currentPanel &&
				this._previewManager.currentPanel.currentConnection === this._connection
			) {
				this._previewManager.currentPanel?.close();
			}

			if (this._serverTaskProvider.isRunning) {
				this._serverTaskProvider.serverStop(true);
			}

			this._connection.disconnected();
			return true;
		}
		return false;
	}

	public get running() {
		return this._server.isRunning;
	}

	// /**
	//  * Whether the file is in the current workspace.
	//  * @param {string} file the path to test.
	//  * @returns {boolean} whether it is in the server's workspace (will always return false if no workspace is open or in multi-workspace)
	//  */
	// public absPathInDefaultWorkspace(file: string): boolean {
	// 	return this._workspaceManager.absPathInDefaultWorkspace(file);
	// }

	/**
	 * @param {string} file the path to test.
	 * @returns {boolean} whether the path exists when placed relative to the workspae root.
	 */
	public pathExistsRelativeToWorkspace(file: string): boolean {
		return this._connection.pathExistsRelativeToWorkspace(file);
	}

	// /**
	//  * @param {string} file the path to use
	//  * @returns {string} the path relative to default workspace. Will return empty string if `!absPathInDefaultWorkspace(file)`
	//  */
	// public getFileRelativeToDefaultWorkspace(file: string): string | undefined {
	// 	return this._workspaceManager.getFileRelativeToDefaultWorkspace(file);
	// }

	// /**
	//  * @returns {number} the port where the HTTP server is running.
	//  */
	// private get _serverPort(): number {
	// 	return this._connectionManager.httpPort;
	// }

	/**
	 * Creates an (or shows the existing) embedded preview.
	 * @param {vscode.WebviewPanel} panel the panel, which may have been serialized from a previous session.
	 * @param {string} file the filesystem path to open in the preview.
	 * @param {boolean} relative whether the path was absolute or relative to the current workspace.
	 * @param {boolean} debug whether to run in debug mode (not implemented).
	 */
	public createOrShowEmbeddedPreview(
		panel: vscode.WebviewPanel | undefined = undefined,
		file = '/',
		relative = true,
		debug = false
	): void {
		if (!this._server.isRunning) {
			// set the pending launch info, which will trigger once the server starts in `launchFileInEmbeddedPreview`
			this._pendingLaunchInfo = {
				external: false,
				panel: panel,
				file: file,
				relative: relative,
				debug: debug,
				connection: this._connection,
			};
			this.openServer();
		} else {
			this._previewManager.launchFileInEmbeddedPreview(
				file,
				relative,
				panel,
				this._connection
			);
		}
	}
}
