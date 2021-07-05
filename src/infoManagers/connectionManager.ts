import { Disposable } from '../utils/dispose';
import * as vscode from 'vscode';
export interface PortInfo {
	port: number;
	ws_port: number;
}
export class ConnectionManager extends Disposable {
	public _wsPort: number;
	public _httpPort: number;
	private _initHttpPort;
	private _initWSPort;

	public get wsPort() {
		return this._wsPort;
	}

	public get httpPort() {
		return this._httpPort;
	}

	constructor(httpPort: number, wsPort: number) {
		super();
		this._initHttpPort = httpPort;
		this._initWSPort = wsPort;

		this._httpPort = this._initHttpPort;
		this._wsPort = this._initWSPort;
	}

	public connected(ports: PortInfo) {
		this._httpPort = ports.port;
		this._wsPort = ports.ws_port;
		this._onConnected.fire(ports);
	}

	public disconnected() {
		this._httpPort = this._initHttpPort;
		this._wsPort = this._initWSPort;
	}

	public set pendingPort(port: number) {
		this._initHttpPort = port;
		this._initWSPort = port + 1;
	}

	private readonly _onConnected = this._register(
		new vscode.EventEmitter<PortInfo>()
	);
	public readonly onConnected = this._onConnected.event;
}
