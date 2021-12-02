import { Disposable } from '../utils/dispose';
import * as vscode from 'vscode';
import { DEFAULT_HOST } from '../utils/constants';
import { isIPv4 } from 'net';

/**
 * @description the port information that the server manager provides.
 */
export interface PortInfo {
	port: number;
	wsPort: number;
}

/**
 * @description the information that gets fired to emitter listeners on connection
 */
export interface ConnectionInfo {
	httpURI: vscode.Uri;
	wsURI: vscode.Uri;
}

/**
 * @description the instance that keeps track of the host and port information for the http and websocket servers.
 * Upon requesting the host, it will resolve its external URI before returning it.
 */
export class ConnectionManager extends Disposable {
	public httpServerBase: string | undefined;
	public wsServerBase: string | undefined;
	private _wsPort: number;
	private _httpPort: number;
	private _initHttpPort;
	private _initWSPort;
	private _initHost: string;
	public host: string;

	public get wsPort() {
		return this._wsPort;
	}

	public get httpPort() {
		return this._httpPort;
	}

	constructor(httpPort: number, wsPort: number, host: string) {
		super();
		this._initHttpPort = httpPort;
		this._initWSPort = wsPort;

		if (!this._validHost(host)) {
			vscode.window.showErrorMessage(
				`The local IP address "${host}" is not formatted correctly. Using default ${DEFAULT_HOST}.`
			);
			this._initHost = DEFAULT_HOST;
		} else if (
			vscode.env.remoteName &&
			vscode.env.remoteName != '' &&
			host != DEFAULT_HOST
		) {
			vscode.window.showErrorMessage(
				`Cannot use the host "${host}" when using a remote connection. Using default ${DEFAULT_HOST}.`
			);
			this._initHost = DEFAULT_HOST;
		} else {
			this._initHost = host;
		}

		this._httpPort = this._initHttpPort;
		this._wsPort = this._initWSPort;

		this.host = this._initHost;
	}

	/**
	 * Called by the server manager to inform this object that a connection has been successful.
	 * @param {PortInfo} ports ports where the HTTP and WS servers are hosted.
	 */
	public connected(ports: PortInfo): void {
		this._httpPort = ports.port;
		this._wsPort = ports.wsPort;

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

	/**
	 * @description Server stopped. Revert back to the original ports for next run.
	 */
	public disconnected(): void {
		this._httpPort = this._initHttpPort;
		this._wsPort = this._initWSPort;
		this.host = this._initHost;
	}

	/**
	 * @description If setting for the initial port is changed, then the initial port is changed for the next server run.
	 */
	public set pendingPort(port: number) {
		this._initHttpPort = port;
		this._initWSPort = port + 1;
	}

	public set pendingHost(host: string) {
		if (this._validHost(host)) {
			this._initHost = host;
		} else {
			vscode.window.showErrorMessage(
				`The local IP address "${host}" is not formatted correctly. Will use default host ${DEFAULT_HOST}.`
			);
			this._initHost = DEFAULT_HOST;
		}
	}

	private readonly _onConnected = this._register(
		new vscode.EventEmitter<ConnectionInfo>()
	);
	public readonly onConnected = this._onConnected.event;

	/**
	 * Use `vscode.env.asExternalUri` to determine the HTTP host and port on the user's machine.
	 * @returns {Promise<vscode.Uri>} a promise for the HTTP URI
	 */
	public async resolveExternalHTTPUri(): Promise<vscode.Uri> {
		const httpPortUri = this.constructLocalUri(this._httpPort);
		return vscode.env.asExternalUri(httpPortUri);
	}
	/**
	 * Use `vscode.env.asExternalUri` to determine the WS host and port on the user's machine.
	 * @returns {Promise<vscode.Uri>} a promise for the WS URI
	 */
	public async resolveExternalWSUri(): Promise<vscode.Uri> {
		const wsPortUri = this.constructLocalUri(this._wsPort);
		return vscode.env.asExternalUri(wsPortUri);
	}

	public resetHostToDefault() {
		if (this.host != DEFAULT_HOST) {
			vscode.window.showErrorMessage(
				`The IP address "${this.host}" cannot be used to host the server. Using default IP ${DEFAULT_HOST}.`
			);
			this._initHost = DEFAULT_HOST;
			this.host = this._initHost;
		}
	}
	private _validHost(host: string) {
		return isIPv4(host);
	}
	/**
	 * @param {number} port
	 * @returns the local address URI.
	 */
	private constructLocalUri(port: number) {
		return vscode.Uri.parse(`http://${this.host}:${port}`);
	}
}
