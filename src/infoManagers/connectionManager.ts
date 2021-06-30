import { Disposable } from '../utils/dispose';
import * as vscode from 'vscode';
export interface PortInfo {
	port?: number;
	ws_port?: number;
}
export class ConnectionManager extends Disposable {
	public wsPort;
	public httpPort;

	constructor(httpPort: number, wsPort: number) {
		super();
		this.httpPort = httpPort;
		this.wsPort = wsPort;
	}

	public connected(ports: PortInfo) {
		this._onConnected.fire(ports);
	}

	private readonly _onConnected = this._register(
		new vscode.EventEmitter<PortInfo>()
	);
	public readonly onConnected = this._onConnected.event;
}
