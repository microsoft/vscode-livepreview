import * as vscode from 'vscode';
import * as net from 'net';
import * as nls from 'vscode-nls';
import { Disposable } from '../utils/dispose';
import { WSServer } from './wsServer';
import { HttpServer } from './httpServer';
import { StatusBarNotifier } from './serverUtils/statusBarNotifier';
import {
	AutoRefreshPreview,
	SettingUtil,
	Settings,
	SETTINGS_SECTION_ID,
} from '../utils/settingsUtil';
import {
	DONT_SHOW_AGAIN,
	LIVE_PREVIEW_SERVER_ON,
	UriSchemes,
} from '../utils/constants';
import TelemetryReporter from 'vscode-extension-telemetry';
import { EndpointManager } from '../infoManagers/endpointManager';
// import { WorkspaceManager } from '../infoManagers/workspaceManager';
import { ConnectionManager } from '../connectionInfo/connectionManager';
import { PathUtil } from '../utils/pathUtil';
import { Connection } from '../connectionInfo/connection';
import { PreviewManager } from '../editorPreview/previewManager';
import { ServerStartedStatus, ServerTaskProvider } from '../task/serverTaskProvider';

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

const localize = nls.loadMessageBundle();
export class ServerManager extends Disposable {
	private readonly _onClose = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onClose = this._onClose.event;
	private _pendingLaunchInfo: launchInfo | undefined;
	private readonly _httpServer: HttpServer;
	private readonly _wsServer: WSServer;
	private _isServerOn = false;
	private _wsConnected = false;
	private _httpConnected = false;
	private readonly _watcher;

	public get port(): number | undefined {
		return this._connection.httpPort;
	}

	constructor(
		private readonly _extensionUri: vscode.Uri,
		_reporter: TelemetryReporter,
		_endpointManager: EndpointManager,
		private readonly _connection: Connection,
		private readonly _statusBar: StatusBarNotifier,
		private readonly _previewManager: PreviewManager,
				private readonly _serverTaskProvider: ServerTaskProvider,
		_userDataDir: string | undefined
	) {
		super();
		this._httpServer = this._register(
			new HttpServer(_extensionUri, _reporter, _endpointManager, _connection)
		);

		if (_connection.workspace) {

			this._watcher = vscode.workspace.createFileSystemWatcher(`{_connection.workspace}**`);
		} else {

			this._watcher = vscode.workspace.createFileSystemWatcher('**');
		}

		this._wsServer = this._register(
			new WSServer(_reporter, _endpointManager, _connection)
		);

		const notUserDataDirChange = function (file: vscode.Uri) {
			return (
				file.scheme != UriSchemes.vscode_userdata &&
				(!_userDataDir || !PathUtil.PathBeginsWith(file.fsPath, _userDataDir))
			);
		};

		this._register(
			vscode.workspace.onDidChangeTextDocument((e) => {
				if (
					e.contentChanges &&
					e.contentChanges.length > 0 &&
					(e.document.uri.scheme == UriSchemes.file ||
						e.document.uri.scheme == UriSchemes.untitled) &&
					this._reloadOnAnyChange
				) {
					this._wsServer.refreshBrowsers();
				}
			})
		);

		this._register(
			this._watcher.onDidChange((e) => {
				if (this._reloadOnSave && notUserDataDirChange(e)) {
					this._wsServer.refreshBrowsers();
				}
			})
		);

		this._register(
			this._watcher.onDidDelete((e) => {
				if (
					(this._reloadOnAnyChange || this._reloadOnSave) &&
					notUserDataDirChange(e)
				) {
					this._wsServer.refreshBrowsers();
				}
			})
		);

		this._register(
			this._watcher.onDidCreate((e) => {
				if (
					(this._reloadOnAnyChange || this._reloadOnSave) &&
					notUserDataDirChange(e)
				) {
					this._wsServer.refreshBrowsers();
				}
			})
		);

		this._register(
			this._httpServer.onNewReqProcessed((e) => {
				this._onNewReqProcessed.fire(e);
			})
		);

		this._register(
			this._wsServer.onConnected(() => {
				this._wsConnected = true;
				if (this._wsConnected && this._httpConnected) {
					this.connected();
				}
			})
		);

		this._register(
			this._httpServer.onConnected((e) => {
				this._httpConnected = true;
				if (this._wsConnected && this._httpConnected) {
					this.connected();
				}
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
				this.updateConfigurations();
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
		vscode.commands.executeCommand('setContext', LIVE_PREVIEW_SERVER_ON, false);
	}

	public get workspace(): vscode.WorkspaceFolder | undefined {
		return this._connection.workspace;
	}
	/**
	 * @returns {boolean} whether the HTTP server is on.
	 */
	public get isRunning(): boolean {
		return this._isServerOn;
	}

	/**
	 * @description update fields to address config changes.
	 */
	public updateConfigurations(): void {
		this._statusBar.updateConfigurations();
	}

	// on each new request processed by the HTTP server, we should
	// relay the information to the task terminal for logging.
	private readonly _onNewReqProcessed = this._register(
		new vscode.EventEmitter<serverMsg>()
	);
	public readonly onNewReqProcessed = this._onNewReqProcessed.event;


	/**
	 * @description close the server instances.
	 */
	public closeServer(): boolean {
		if (this.isRunning) {
			this._statusBar.RemoveServer(this._connection.workspace?.uri);
			this._httpServer.close();
			this._wsServer.close();
			this._isServerOn = false;
			this.showServerStatusMessage('Server Stopped');
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

	/**
	 * @description open the server instances.
	 * @param {number} port the port to try to start the HTTP server on.
	 * @returns {boolean} whether the server has been started correctly.
	 */
	public openServer(fromTask = false): boolean {

		const port = this._connection.httpPort;
		if (!this.isRunning) {

		this._httpConnected = false;
		this._wsConnected = false;
		if (this._extensionUri) {
			this.findFreePort(port, (freePort: number) => {
				this._httpServer.start(freePort);
				this._wsServer.start(freePort + 1);
			});
			return true;
		}
		return false;
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
	 * @description whether to reload on any change from the editor.
	 */
	private get _reloadOnAnyChange(): boolean {
		return (
			SettingUtil.GetConfig(this._extensionUri).autoRefreshPreview ==
			AutoRefreshPreview.onAnyChange
		);
	}

	/**
	 * @description whether to reload on file save.
	 */
	private get _reloadOnSave(): boolean {
		return (
			SettingUtil.GetConfig(this._extensionUri).autoRefreshPreview ==
			AutoRefreshPreview.onSave
		);
	}

	/**
	 * Find the first free port following (or on) the initial port configured in settings
	 * @param startPort the port to start the check on
	 * @param callback the callback triggerred when a free port has been found.
	 */
	private findFreePort(
		startPort: number,
		callback: (port: number) => void
	): void {
		let port = startPort;
		const sock = new net.Socket();
		const host = this._connection.host;
		sock.setTimeout(500);
		sock.on('connect', function () {
			sock.destroy();
			port++;
			sock.connect(port, host);
		});
		sock.on('error', function (e) {
			callback(port);
			return;
		});
		sock.on('timeout', function () {
			callback(port);
			return;
		});
		sock.connect(port, host);
	}

	/**
	 * @description called when both servers are connected. Performs operations to update server status.
	 */
	private connected() {
		this._isServerOn = true;
		this._statusBar.setServer(this._connection.workspace?.uri,
			this._connection.httpPort);

		this.showServerStatusMessage(
			localize(
				'serverStartedOnPort',
				'Server Started on Port {0}',
				this._connection.httpPort
			)
		);
		this._connection.connected(
			this._connection.httpPort,
			this._wsServer.wsPort,
			this._wsServer.wsPath
		);
		vscode.commands.executeCommand('setContext', LIVE_PREVIEW_SERVER_ON, true);
	}

	/**
	 * @description show messages related to server status updates if configured to do so in settings.
	 * @param messsage message to show.
	 */
	private showServerStatusMessage(messsage: string) {
		if (
			SettingUtil.GetConfig(this._extensionUri).showServerStatusNotifications
		) {
			vscode.window
				.showInformationMessage(messsage, DONT_SHOW_AGAIN)
				.then((selection: vscode.MessageItem | undefined) => {
					if (selection == DONT_SHOW_AGAIN) {
						SettingUtil.UpdateSettings(
							Settings.showServerStatusNotifications,
							false
						);
					}
				});
		}
	}



	dispose() {
		this.closeServer();
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
			if (!this.isRunning) {
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


	public get running() {
		return this.isRunning;
	}

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
		if (!this.isRunning) {
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

	/**
	 * @param {string} file the path to test.
	 * @returns {boolean} whether the path exists when placed relative to the workspae root.
	 */
	public pathExistsRelativeToWorkspace(file: string): boolean {
		return this._connection.pathExistsRelativeToWorkspace(file);
	}
}
