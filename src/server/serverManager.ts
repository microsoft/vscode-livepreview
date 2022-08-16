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
import { serverMsg } from '../serverGrouping';
import { PathUtil } from '../utils/pathUtil';
import { Connection } from '../connectionInfo/connection';

const localize = nls.loadMessageBundle();
export class ServerManager extends Disposable {
	private readonly _httpServer: HttpServer;
	private readonly _wsServer: WSServer;
	private _isServerOn = false;
	private _wsConnected = false;
	private _httpConnected = false;
	private readonly _watcher;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		_reporter: TelemetryReporter,
		_endpointManager: EndpointManager,
		// _workspaceManager: WorkspaceManager,
		private readonly _connection: Connection,
		private readonly _statusBar: StatusBarNotifier,
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

		vscode.commands.executeCommand('setContext', LIVE_PREVIEW_SERVER_ON, false);
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
	public closeServer(): void {
		this._statusBar.RemoveServer(this._connection.workspace?.uri);
		this._httpServer.close();
		this._wsServer.close();
		this._isServerOn = false;
		this.showServerStatusMessage('Server Stopped');
		vscode.commands.executeCommand('setContext', LIVE_PREVIEW_SERVER_ON, false);
	}

	/**
	 * @description open the server instances.
	 * @param {number} port the port to try to start the HTTP server on.
	 * @returns {boolean} whether the server has been started correctly.
	 */
	public openServer(port: number): boolean {
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
		this._statusBar.setServer(this._connection.workspace?.uri,this._httpServer.port);

		this.showServerStatusMessage(
			localize(
				'serverStartedOnPort',
				'Server Started on Port {0}',
				this._httpServer.port
			)
		);
		this._connection.connected(
			this._httpServer.port,
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
}
