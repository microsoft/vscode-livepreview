import * as vscode from 'vscode';
import { Disposable } from '../utils/dispose';
import { WSServer } from './wsServer';
import { HttpServer } from './httpServer';
import { StatusBarNotifier } from './serverUtils/statusBarNotifier';
import {
	AutoRefreshPreview,
	SettingUtil,
	Settings,
} from '../utils/settingsUtil';
import { DONT_SHOW_AGAIN } from '../utils/constants';
import TelemetryReporter from 'vscode-extension-telemetry';
import { EndpointManager } from '../infoManagers/endpointManager';
import { WorkspaceManager } from '../infoManagers/workspaceManager';
import { ConnectionManager } from '../infoManagers/connectionManager';
import { serverMsg } from '../manager';

export class Server extends Disposable {
	private readonly _httpServer: HttpServer;
	private readonly _wsServer: WSServer;
	private readonly _statusBar: StatusBarNotifier;
	private _isServerOn = false;

	// private get _workspacePath() {
	// 	return this._workspaceManager.workspacePath;
	// }

	constructor(
		private readonly _extensionUri: vscode.Uri,
		endpointManager: EndpointManager,
		reporter: TelemetryReporter,
		workspaceManager: WorkspaceManager,
		private readonly _connectionManager: ConnectionManager
	) {
		super();
		this._httpServer = this._register(
			new HttpServer(_extensionUri, reporter, endpointManager, workspaceManager)
		);
		this._wsServer = this._register(
			new WSServer(reporter, endpointManager, workspaceManager)
		);
		this._statusBar = this._register(new StatusBarNotifier(_extensionUri));

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
			vscode.workspace.onDidSaveTextDocument(() => {
				if (this._reloadOnSave) {
					this._wsServer.refreshBrowsers();
				}
			})
		);

		this._register(
			vscode.workspace.onDidRenameFiles(() => {
				if (this._reloadOnAnyChange || this._reloadOnSave) {
					this._wsServer.refreshBrowsers();
				}
			})
		);
		this._register(
			vscode.workspace.onDidDeleteFiles(() => {
				if (this._reloadOnAnyChange || this._reloadOnSave) {
					this._wsServer.refreshBrowsers();
				}
			})
		);
		this._register(
			vscode.workspace.onDidCreateFiles(() => {
				if (this._reloadOnAnyChange || this._reloadOnSave) {
					this._wsServer.refreshBrowsers();
				}
			})
		);

		this._register(
			this._connectionManager.onConnected((e) => {
				if (e.ws_port) {
					this._httpServer.setInjectorWSPort(e.ws_port);
				}
			})
		);

		this._register(
			this._httpServer.onNewReqProcessed((e) => {
				this._onNewReqProcessed.fire(e);
			})
		);

		this._register(
			this._wsServer.onConnected((e) => {
				this.wsServerConnected();
			})
		);

		this._register(
			this._httpServer.onConnected((e) => {
				this.httpServerConnected();
			})
		);
		vscode.commands.executeCommand('setContext', 'LivePreviewServerOn', false);
	}

	public get port() {
		return this._httpServer.port;
	}

	public set port(portNum: number) {
		this._httpServer.port = portNum;
	}

	public get ws_port() {
		return this._wsServer.ws_port;
	}

	public set ws_port(portNum: number) {
		this._wsServer.ws_port = portNum;
	}

	public get isRunning(): boolean {
		return this._isServerOn;
	}

	// public canGetPath(path: string) {
	// 	return this._workspaceManager.canGetPath(path);
	// }

	// public getFileRelativeToWorkspace(path: string): string {
	// 	const workspaceFolder = this._workspacePath;

	// 	if (workspaceFolder && path.startsWith(workspaceFolder)) {
	// 		return path.substr(workspaceFolder.length).replace(/\\/gi, '/');
	// 	} else {
	// 		return '';
	// 	}
	// }

	public updateConfigurations() {
		this._statusBar.updateConfigurations();
	}

	// private readonly _onPortChangeEmitter = this._register(
	// 	new vscode.EventEmitter<PortInfo>()
	// );

	// public readonly onPortChange = this._onPortChangeEmitter.event;

	private readonly _onNewReqProcessed = this._register(
		new vscode.EventEmitter<serverMsg>()
	);
	public readonly onNewReqProcessed = this._onNewReqProcessed.event;

	// private readonly _onFullyConnected = this._register(
	// 	new vscode.EventEmitter<{ port: number }>()
	// );

	// public readonly onFullyConnected = this._onFullyConnected.event;

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
		if (this._extensionUri) {
			// initialize websockets to use port after http server port
			this._httpServer.setInjectorWSPort(port + 1);

			this._httpServer.start(port);
			return true;
		}
		return false;
	}

	private httpServerConnected() {
		this._wsServer.start(this._httpServer.port + 1);
	}

	private wsServerConnected() {
		this._isServerOn = true;
		this._statusBar.ServerOn(this._httpServer.port);

		this.showServerStatusMessage(
			`Server Opened on Port ${this._httpServer.port}`
		);
		this._connectionManager.connected({ port: this._httpServer.port });
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
