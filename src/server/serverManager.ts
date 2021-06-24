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
import { serverMsg } from '../manager';
import { PathUtil } from '../utils/pathUtil';
import TelemetryReporter from 'vscode-extension-telemetry';
import { EndpointManager } from './serverUtils/endpointManager';

export interface PortInfo {
	port?: number;
	ws_port?: number;
}

export class Server extends Disposable {
	private readonly _httpServer: HttpServer;
	private readonly _wsServer: WSServer;
	private readonly _statusBar: StatusBarNotifier;
	private readonly _endpointManager: EndpointManager;
	private _isServerOn = false;
	private _workspacePath: string | undefined;

	public encodeEndpoint(location: string): string {
		return this._endpointManager.encodeLooseFileEndpoint(location);
	}

	public decodeEndpoint(location: string): string | undefined {
		return this._endpointManager.decodeLooseFileEndpoint(location);
	}

	constructor(
		private readonly _extensionUri: vscode.Uri,
		reporter: TelemetryReporter
	) {
		super();
		this._endpointManager = this._register(new EndpointManager());
		this._httpServer = this._register(
			new HttpServer(_extensionUri, reporter, this._endpointManager)
		);
		this._wsServer = this._register(
			new WSServer(reporter, this._endpointManager)
		);
		this._statusBar = this._register(new StatusBarNotifier(_extensionUri));
		this._workspacePath = PathUtil.GetWorkspacePath();

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
			this.onPortChange((e) => {
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
				this._onPortChangeEmitter.fire({ ws_port: e });
				this.wsServerConnected();
			})
		);

		this._register(
			this._httpServer.onConnected((e) => {
				this._onPortChangeEmitter.fire({ port: e });
				this.httpServerConnected();
			})
		);
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

	public canGetPath(path: string) {
		return this._workspacePath ? path.startsWith(this._workspacePath) : false;
	}

	public getFileRelativeToWorkspace(path: string): string {
		const workspaceFolder = this._workspacePath;

		if (workspaceFolder && path.startsWith(workspaceFolder)) {
			return path.substr(workspaceFolder.length).replace(/\\/gi, '/');
		} else {
			return '';
		}
	}

	public updateConfigurations() {
		this._statusBar.updateConfigurations();
	}

	private readonly _onPortChangeEmitter = this._register(
		new vscode.EventEmitter<PortInfo>()
	);

	public readonly onPortChange = this._onPortChangeEmitter.event;

	private readonly _onNewReqProcessed = this._register(
		new vscode.EventEmitter<serverMsg>()
	);
	public readonly onNewReqProcessed = this._onNewReqProcessed.event;

	private readonly _onFullyConnected = this._register(
		new vscode.EventEmitter<{ port: number }>()
	);

	public readonly onFullyConnected = this._onFullyConnected.event;

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
	}

	public openServer(port: number): boolean {
		if (this._extensionUri) {
			// initialize websockets to use port after http server port
			this._httpServer.setInjectorWSPort(port + 1);

			this._httpServer.start(port, this._workspacePath ?? '');
			return true;
		}
		return false;
	}

	private httpServerConnected() {
		this._wsServer.start(this._httpServer.port + 1, this._workspacePath ?? '');
	}

	private wsServerConnected() {
		this._isServerOn = true;
		this._statusBar.ServerOn(this._httpServer.port);

		this.showServerStatusMessage(
			`Server Opened on Port ${this._httpServer.port}`
		);
		this._onFullyConnected.fire({ port: this._httpServer.port });
	}

	private showServerStatusMessage(messsage: string) {
		if (SettingUtil.GetConfig(this._extensionUri).showServerStatusPopUps) {
			vscode.window
				.showInformationMessage(messsage, DONT_SHOW_AGAIN)
				.then((selection: vscode.MessageItem | undefined) => {
					if (selection == DONT_SHOW_AGAIN) {
						SettingUtil.UpdateSettings(Settings.showServerStatusPopUps, false);
					}
				});
		}
	}
}
