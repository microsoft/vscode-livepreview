import * as vscode from 'vscode';
import { Disposable } from '../utils/dispose';
import { WSServer } from './wsServer';
import { MainServer } from './mainServer';
import { StatusBarNotifier } from './statusBarNotifier';

export interface PortInfo {
	port?: number;
	ws_port?: number;
}

export class Server extends Disposable {
	private _isServerOn = false;
	private _mainServer: MainServer;
	private _wsServer: WSServer;
	private _statusBar: StatusBarNotifier;

	constructor() {
		super();
		this._mainServer = this._register(new MainServer());
		this._wsServer = this._register(new WSServer());
		this._statusBar = this._register(new StatusBarNotifier());
		this._register(
			vscode.workspace.onDidChangeTextDocument((e) => {
				if (e.contentChanges && e.contentChanges.length > 0) {
					this._wsServer.refreshBrowsers();
				}
			})
		);

		this._register(
			vscode.workspace.onDidRenameFiles((e) => {
				this._wsServer.refreshBrowsers();
			})
		);
		this._register(
			vscode.workspace.onDidDeleteFiles((e) => {
				this._wsServer.refreshBrowsers();
			})
		);
		this._register(
			vscode.workspace.onDidCreateFiles((e) => {
				this._wsServer.refreshBrowsers();
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

	private readonly _onPortChangeEmitter = this._register(
		new vscode.EventEmitter<PortInfo>()
	);
	public readonly onPortChange = this._onPortChangeEmitter.event;

	public get isRunning(): boolean {
		return this._isServerOn;
	}

	public closeServer(): void {
		this._statusBar.loading('on');
		this._mainServer.close();
		this._wsServer.close();
		this._isServerOn = false; // TODO: find error conditions and return false when needed
		this._statusBar.ServerOff();
	}

	public openServer(
		port: number,
		ws_port: number,
		path: vscode.WorkspaceFolder | undefined,
		extensionUri: vscode.Uri | undefined
	): void {
		if (path && extensionUri) {
			this._statusBar.loading('off');
			this._mainServer.setInjectorWSPort(ws_port, extensionUri);
			const basePath = path.uri.fsPath;

			this._mainServer.start(port, basePath);
			this._wsServer.start(ws_port, basePath, extensionUri);
			this._isServerOn = true;
			this._statusBar.ServerOn(this._mainServer.port);
		}
	}
}
