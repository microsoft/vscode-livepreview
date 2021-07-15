import * as vscode from 'vscode';
import * as net from 'net';
import { Disposable } from '../utils/dispose';
import { WSServer } from './wsServer';
import { HttpServer } from './httpServer';
import { StatusBarNotifier } from './serverUtils/statusBarNotifier';
import {
	AutoRefreshPreview,
	SettingUtil,
	Settings,
} from '../utils/settingsUtil';
import { DONT_SHOW_AGAIN, HOST } from '../utils/constants';
import TelemetryReporter from 'vscode-extension-telemetry';
import { EndpointManager } from '../infoManagers/endpointManager';
import { WorkspaceManager } from '../infoManagers/workspaceManager';
import { ConnectionManager } from '../infoManagers/connectionManager';
import { serverMsg } from '../manager';
import { PathUtil } from '../utils/pathUtil';

export class Server extends Disposable {
	private readonly _httpServer: HttpServer;
	private readonly _wsServer: WSServer;
	private readonly _statusBar: StatusBarNotifier;
	private _isServerOn = false;
	private _wsConnected = false;
	private _httpConnected = false;
	private readonly _watcher;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		endpointManager: EndpointManager,
		reporter: TelemetryReporter,
		private readonly _workspaceManager: WorkspaceManager,
		private readonly _connectionManager: ConnectionManager,
		userDataDir: string | undefined
	) {
		super();
		this._httpServer = this._register(
			new HttpServer(
				_extensionUri,
				reporter,
				endpointManager,
				_workspaceManager,
				_connectionManager
			)
		);

		this._watcher = vscode.workspace.createFileSystemWatcher('**');

		this._wsServer = this._register(
			new WSServer(reporter, endpointManager, _workspaceManager)
		);
		this._statusBar = this._register(new StatusBarNotifier(_extensionUri));

		const notUserDataDirChange = function (file: vscode.Uri) {
			return (
				file.scheme != 'vscode-userdata' &&
				(!userDataDir || !PathUtil.PathBeginsWith(file.fsPath, userDataDir))
			);
		};

		this._register(
			vscode.workspace.onDidChangeTextDocument((e) => {
				if (
					e.contentChanges &&
					e.contentChanges.length > 0 &&
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

		this._register(
			this._connectionManager.onConnected((e) => {
				this._httpServer.refreshInjector();
				this._wsServer.externalHostName = `${e.httpURI.scheme}://${e.httpURI.authority}`;
			})
		);

		vscode.commands.executeCommand('setContext', 'LivePreviewServerOn', false);
	}

	public get isRunning(): boolean {
		return this._isServerOn;
	}

	public updateConfigurations() {
		this._statusBar.updateConfigurations();
	}

	private readonly _onNewReqProcessed = this._register(
		new vscode.EventEmitter<serverMsg>()
	);
	public readonly onNewReqProcessed = this._onNewReqProcessed.event;

	private get _reloadOnAnyChange() {
		return (
			SettingUtil.GetConfig(this._extensionUri).autoRefreshPreview ==
			AutoRefreshPreview.onAnyChange
		);
	}

	private get _reloadOnSave() {
		return (
			SettingUtil.GetConfig(this._extensionUri).autoRefreshPreview ==
			AutoRefreshPreview.onSave
		);
	}

	public closeServer(): void {
		this._httpServer.close();
		this._wsServer.close();
		this._isServerOn = false; // TODO: find error conditions and return false when needed
		this._statusBar.ServerOff();

		this.showServerStatusMessage('Server Closed');
		vscode.commands.executeCommand('setContext', 'LivePreviewServerOn', false);
	}

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

	private findFreePort(
		startPort: number,
		callback: (port: number) => void
	): void {
		let port = startPort;
		const sock = new net.Socket();

		sock.setTimeout(500);
		sock.on('connect', function () {
			sock.destroy();
			port++;
			sock.connect(port, HOST);
		});
		sock.on('error', function (e) {
			callback(port);
		});
		sock.on('timeout', function () {
			callback(port);
		});
		sock.connect(port, HOST);
	}

	private connected() {
		this._isServerOn = true;
		this._statusBar.ServerOn(this._httpServer.port);

		this.showServerStatusMessage(
			`Server Opened on Port ${this._httpServer.port}`
		);
		this._connectionManager.connected({
			port: this._httpServer.port,
			ws_port: this._wsServer.ws_port,
		});
		vscode.commands.executeCommand('setContext', 'LivePreviewServerOn', true);
	}

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
