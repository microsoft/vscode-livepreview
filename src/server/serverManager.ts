import * as vscode from 'vscode';
import { Disposable } from '../dispose';
import { WSServer } from './wsServer';
import { MainServer } from './mainServer';

export interface PortInfo {
	port?: number; ws_port?: number
}

export class Server extends Disposable {
	private _isServerOn = false;
	private _mainServer = new MainServer;
	private _wsServer = new WSServer;

	constructor() {
		super();

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
	}

	private readonly _onPortChangeEmitter = this._register(
		new vscode.EventEmitter<PortInfo>()
	);
	public readonly onPortChange = this._onPortChangeEmitter.event;

	public get isRunning(): boolean {
		return this._isServerOn;
	}

	public closeServer(): void {
		this._mainServer.close();
		this._wsServer.close();
		this._isServerOn = false; // TODO: find error conditions and return false when needed
	}

	public openServer(
		port: number,
		ws_port: number,
		path: vscode.WorkspaceFolder | undefined,
		extensionUri: vscode.Uri | undefined
	): void {
		if (path && extensionUri) {
			this._mainServer.setInjectorWSPort(ws_port, extensionUri);
			const basePath = path.uri.fsPath;
			
			this._mainServer.start(port,basePath);
			this._wsServer.start(ws_port, basePath, extensionUri);
			this._isServerOn = true;
		}
	}
}
