import { Disposable } from '../utils/dispose';
import * as vscode from 'vscode';
import { HOST } from '../utils/constants';
export interface PortInfo {
	port: number;
	ws_port: number;
}

export interface ConnectionInfo {
	httpURI: vscode.Uri;
	wsURI: vscode.Uri;
}

export class ConnectionManager extends Disposable {
	public httpServerBase: string | undefined;
	public wsServerBase: string | undefined;
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

	private constructLocalUri(port: number) {
		return vscode.Uri.parse(`http://${HOST}:${port}`);
	}

	public connected(ports: PortInfo) {
		this._httpPort = ports.port;
		this._wsPort = ports.ws_port;

		const httpPortUri = this.constructLocalUri(this._httpPort);
		const wsPortUri = this.constructLocalUri(this._wsPort);

		vscode.env.asExternalUri(httpPortUri).then((externalHTTPUri) => {
			vscode.env.asExternalUri(wsPortUri).then((externalWSUri) => {
				this._onConnected.fire({
					httpURI: externalHTTPUri,
					wsURI: externalWSUri,
				});
			});
		});
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
		new vscode.EventEmitter<ConnectionInfo>()
	);
	public readonly onConnected = this._onConnected.event;

	public async resolveExternalHTTPUri(): Promise<vscode.Uri> {
		const httpPortUri = this.constructLocalUri(this._httpPort);
		return vscode.env.asExternalUri(httpPortUri);
	}

	public async resolveExternalWSUri(): Promise<vscode.Uri> {
		const wsPortUri = this.constructLocalUri(this._wsPort);
		return vscode.env.asExternalUri(wsPortUri);
	}
}
