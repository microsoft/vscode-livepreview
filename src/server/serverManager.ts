import * as vscode from 'vscode';
import { Disposable } from '../utils/dispose';
import { WSServer } from './wsServer';
import { MainServer } from './mainServer';
import { StatusBarNotifier } from './serverUtils/statusBarNotifier';
import { AutoRefreshPreview, GetConfig } from '../utils/utils';

export interface PortInfo {
	port?: number;
	ws_port?: number;
}

export class Server extends Disposable {
	private _isServerOn = false;
	private _mainServer: MainServer;
	private _wsServer: WSServer;
	private _statusBar: StatusBarNotifier;
	private _extensionUri: vscode.Uri;

	constructor(extensionUri: vscode.Uri) {
		super();
		this._extensionUri = extensionUri;
		this._mainServer = this._register(new MainServer());
		this._wsServer = this._register(new WSServer());
		this._statusBar = this._register(new StatusBarNotifier(extensionUri));

		this._register(
			vscode.workspace.onDidChangeTextDocument((e) => {
				if (e.contentChanges && e.contentChanges.length > 0 && this._reloadOnAnyChange) {
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
					this._mainServer.setInjectorWSPort(e.ws_port);
				}
			})
		);

		this._register(
			this._wsServer.onPortChange((e) => {
				this._onPortChangeEmitter.fire(e);
			})
		);

		this._register(
			this._mainServer.onPortChange((e) => {
				this._onPortChangeEmitter.fire(e);
				this._statusBar.ServerOn(this._mainServer.port);
			})
		);
	}

	public get isRunning(): boolean {
		return this._isServerOn;
	}

	public updateConfigurations() {
		this._statusBar.updateConfigurations();
	}

	private readonly _onPortChangeEmitter = this._register(
		new vscode.EventEmitter<PortInfo>()
	);

	public readonly onPortChange = this._onPortChangeEmitter.event;

	private get _reloadOnAnyChange() {
		return GetConfig(this._extensionUri).autoRefreshPreview == AutoRefreshPreview.onAnyChange;
	}

	private get _reloadOnSave() {
		return GetConfig(this._extensionUri).autoRefreshPreview == AutoRefreshPreview.onSave;
	}

	public closeServer(): void {
		this._statusBar.loading('on');
		this._mainServer.close();
		this._wsServer.close();
		this._isServerOn = false; // TODO: find error conditions and return false when needed
		this._statusBar.ServerOff();

		if (GetConfig(this._extensionUri).showServerStatusPopUps) {
			vscode.window.showInformationMessage("Server Closed");
		}
	}

	public openServer(
		port: number,
		ws_port: number,
		path: vscode.WorkspaceFolder | undefined
	): boolean {
		if (path && this._extensionUri) {
			this._statusBar.loading('off');
			this._mainServer.setInjectorWSPort(ws_port, this._extensionUri);
			const basePath = path.uri.fsPath;

			this._mainServer.start(port, basePath);
			this._wsServer.start(ws_port, basePath, this._extensionUri);
			this._isServerOn = true;
			this._statusBar.ServerOn(this._mainServer.port);
			
			if (GetConfig(this._extensionUri).showServerStatusPopUps) {
				vscode.window.showInformationMessage(`Server Opened on Port ${this._mainServer.port}`);
			}
			return true;
		}
		if (GetConfig(this._extensionUri).showServerStatusPopUps) {
			vscode.window.showInformationMessage("Server Failed To Open");
		}
		return false;
	}
}
