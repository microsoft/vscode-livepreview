import * as vscode from 'vscode';
import * as net from 'net';
import * as nls from 'vscode-nls';
import { Disposable } from '../utils/dispose';
import { WSServer } from './wsServer';
import { HttpServer } from './httpServer';
import {
	AutoRefreshPreview,
	SettingUtil,
	Settings,
} from '../utils/settingsUtil';
import { DONT_SHOW_AGAIN, UriSchemes } from '../utils/constants';
import TelemetryReporter from 'vscode-extension-telemetry';
import { EndpointManager } from '../infoManagers/endpointManager';
import { PathUtil } from '../utils/pathUtil';
import { Connection } from '../connectionInfo/connection';
import {
	ServerStartedStatus,
	ServerTaskProvider,
} from '../task/serverTaskProvider';

/**
 * @description the server log item that is sent from the HTTP server to the server logging task.
 */
export interface IServerMsg {
	method: string;
	url: string;
	status: number;
}

/**
 * @description the info for launching a preview, used after a server is launched.
 */
export interface ILaunchInfo {
	external: boolean;
	uri?: vscode.Uri;
	debug: boolean;
	panel?: vscode.WebviewPanel;
	connection: Connection;
}

interface IExternalPreviewArgs {
	uri?: vscode.Uri;
	debug: boolean;
	connection: Connection;
}

interface IEmbeddedPreviewArgs {
	uri?: vscode.Uri;
	panel: vscode.WebviewPanel | undefined;
	connection: Connection;
}

const localize = nls.loadMessageBundle();
export class ServerGrouping extends Disposable {
	private _pendingLaunchInfo: ILaunchInfo | undefined;
	private readonly _httpServer: HttpServer;
	private readonly _wsServer: WSServer;
	private _isServerOn = false;
	private _wsConnected = false;
	private _httpConnected = false;

	// on each new request processed by the HTTP server, we should
	// relay the information to the task terminal for logging.
	private readonly _onNewReqProcessed = this._register(
		new vscode.EventEmitter<IServerMsg>()
	);
	public readonly onNewReqProcessed = this._onNewReqProcessed.event;

	private readonly _onClose = this._register(new vscode.EventEmitter<void>());
	public readonly onClose = this._onClose.event;

	// private readonly _onAttemptToOpen = this._register(new vscode.EventEmitter<void>());
	// public readonly onAttemptToOpen = this._onAttemptToOpen.event;

	private readonly _onShouldLaunchExternalPreview = this._register(
		new vscode.EventEmitter<IExternalPreviewArgs>()
	);
	public readonly onShouldLaunchExternalPreview =
		this._onShouldLaunchExternalPreview.event;

	private readonly _onShouldLaunchEmbeddedPreview = this._register(
		new vscode.EventEmitter<IEmbeddedPreviewArgs>()
	);
	public readonly onShouldLaunchEmbeddedPreview =
		this._onShouldLaunchEmbeddedPreview.event;

	constructor(
		_extensionUri: vscode.Uri,
		_reporter: TelemetryReporter,
		_endpointManager: EndpointManager,
		private readonly _connection: Connection,
		private readonly _serverTaskProvider: ServerTaskProvider,
		private readonly _pendingServerWorkspaces: Set<string | undefined>
	) {
		super();
		this._httpServer = this._register(
			new HttpServer(_extensionUri, _reporter, _endpointManager, _connection)
		);

		this._wsServer = this._register(
			new WSServer(_reporter, _endpointManager, _connection)
		);

		this._register(
			this._httpServer.onNewReqProcessed((e) => {
				this._serverTaskProvider.sendServerInfoToTerminal(
					e,
					this._connection.workspace
				);
				this._onNewReqProcessed.fire(e);
			})
		);

		this._register(
			this._wsServer.onConnected(() => {
				this._wsConnected = true;
				if (this._wsConnected && this._httpConnected) {
					this._connected();
				}
			})
		);

		this._register(
			this._httpServer.onConnected(() => {
				this._httpConnected = true;
				if (this._wsConnected && this._httpConnected) {
					this._connected();
				}
			})
		);
		this._connection.onConnected((e) => {
			this._serverTaskProvider.serverStarted(
				e.httpURI,
				ServerStartedStatus.JUST_STARTED,
				this._connection.workspace
			);

			if (this._pendingLaunchInfo) {
				if (this._pendingLaunchInfo.external) {
					this._onShouldLaunchExternalPreview.fire({
						uri: this._pendingLaunchInfo.uri,
						debug: this._pendingLaunchInfo.debug,
						connection: this._connection,
					});
				} else {
					this._onShouldLaunchEmbeddedPreview.fire({
						uri: this._pendingLaunchInfo.uri,
						panel: this._pendingLaunchInfo.panel,
						connection: this._connection,
					});
				}

				this._pendingLaunchInfo = undefined;
			}
		});
	}

	public get port(): number | undefined {
		return this._connection.httpPort;
	}

	public get workspace(): vscode.WorkspaceFolder | undefined {
		return this._connection.workspace;
	}
	/**
	 * @returns {boolean} whether the servers are on.
	 */
	public get isRunning(): boolean {
		return this._isServerOn;
	}

	public refresh(): void {
		this._wsServer.refreshBrowsers();
	}

	/**
	 * @description close the server instances.
	 */
	public closeServer(): boolean {
		if (this.isRunning) {
			this._httpServer.close();
			this._wsServer.close();
			this._isServerOn = false;

			this._serverTaskProvider.serverStop(true, this._connection.workspace);

			this._showServerStatusMessage('Server Stopped');
			this._onClose.fire();

			if (this._serverTaskProvider.isTaskRunning(this._connection.workspace)) {
				// stop the associated task
				this._serverTaskProvider.serverStop(true, this._connection.workspace);
			}

			this._connection.dispose();
			return true;
		}
		return false;
	}

	/**
	 * @description open the server instances.
	 * @param {number} port the port to try to start the HTTP server on.
	 * @returns {boolean} whether the server has been started correctly.
	 */
	public async openServer(fromTask = false): Promise<void> {
		if (this._pendingServerWorkspaces.has(this.workspace?.uri.toString())) {
			// server is already being opened for this, don't try to open another one
			return;
		}

		const port = this._connection.httpPort;
		this._pendingServerWorkspaces.add(this.workspace?.uri.toString());
		if (!this.isRunning) {
			this._httpConnected = false;
			this._wsConnected = false;

			const freePort = await this._findFreePort(port);
			this._httpServer.start(freePort);
			this._wsServer.start(freePort + 1);
		} else if (fromTask) {
			const uri = await this._connection.resolveExternalHTTPUri();
			this._serverTaskProvider.serverStarted(
				uri,
				ServerStartedStatus.STARTED_BY_EMBEDDED_PREV,
				this._connection.workspace
			);
		}
	}

	/**
	 * Opens the preview in an external browser.
	 * @param {string} file the filesystem path to open in the preview.
	 * @param {boolean} relative whether the path was absolute or relative to the current workspace.
	 * @param {boolean} debug whether or not to run in debug mode.
	 */
	public async showPreviewInBrowser(
		debug: boolean,
		file?: vscode.Uri
	): Promise<void> {
		if (!this._serverTaskProvider.isTaskRunning(this._connection.workspace)) {
			if (!this.isRunning) {
				// set the pending launch info, which will trigger once the server starts in `launchFileInExternalPreview`
				this._pendingLaunchInfo = {
					external: true,
					uri: file,
					debug: debug,
					connection: this._connection,
				};
			} else {
				this._onShouldLaunchExternalPreview.fire({
					uri: file,
					debug,
					connection: this._connection,
				});
			}
			if (
				vscode.workspace.workspaceFolders &&
				vscode.workspace.workspaceFolders.length > 0
			) {
				await this._serverTaskProvider.extRunTask(this._connection.workspace);
			} else {
				// global tasks are currently not supported, just turn on server in this case.
				await this.openServer();
			}
		} else {
			this._onShouldLaunchExternalPreview.fire({
				uri: file,
				debug,
				connection: this._connection,
			});
		}
	}

	public get running(): boolean {
		return this.isRunning;
	}

	/**
	 * Creates an (or shows the existing) embedded preview.
	 * @param {vscode.WebviewPanel} panel the panel, which may have been serialized from a previous session.
	 * @param {string} file the filesystem path to open in the preview.
	 * @param {boolean} relative whether the path was absolute or relative to the current workspace.
	 * @param {boolean} debug whether to run in debug mode (not implemented).
	 */
	public async createOrShowEmbeddedPreview(
		panel: vscode.WebviewPanel | undefined = undefined,
		file?: vscode.Uri,
		debug = false
	): Promise<void> {
		if (!this.isRunning) {
			// set the pending launch info, which will trigger once the server starts in `launchFileInEmbeddedPreview`
			this._pendingLaunchInfo = {
				external: false,
				panel: panel,
				uri: file,
				debug: debug,
				connection: this._connection,
			};
			await this.openServer();
		} else {
			this._onShouldLaunchEmbeddedPreview.fire({
				uri: file,
				panel,
				connection: this._connection,
			});
		}
	}

	/**
	 * @param {string} file the path to test.
	 * @returns {boolean} whether the path exists when placed relative to the workspae root.
	 */
	public pathExistsRelativeToWorkspace(file: string): boolean {
		return this._connection.pathExistsRelativeToWorkspace(file);
	}

	/**
	 * Find the first free port following (or on) the initial port configured in settings
	 * @param startPort the port to start the check on
	 * @param callback the callback triggerred when a free port has been found.
	 */
	private async _findFreePort(
		startPort: number
	): Promise<number> {
		return new Promise((resolve) => {
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
				resolve(port);
			});
			sock.on('timeout', function () {
				resolve(port);
			});
			sock.connect(port, host);
		});
	}

	/**
	 * @description called when both servers are connected. Performs operations to update server status.
	 */
	private async _connected(): Promise<void> {
		this._isServerOn = true;

		this._showServerStatusMessage(
			localize(
				'serverStartedOnPort',
				'Server Started on Port {0}',
				this._connection.httpPort
			)
		);
		await this._connection.connected(
			this._connection.httpPort,
			this._wsServer.wsPort,
			this._wsServer.wsPath
		);
	}

	/**
	 * @description show messages related to server status updates if configured to do so in settings.
	 * @param messsage message to show.
	 */
	private _showServerStatusMessage(messsage: string): void {
		if (SettingUtil.GetConfig().showServerStatusNotifications) {
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

	dispose(): void {
		this.closeServer();
	}
}
