import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { Disposable } from '../utils/dispose';
import { DEFAULT_HOST } from '../utils/constants';
import { isIPv4 } from 'net';

const localize = nls.loadMessageBundle();

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
	private _wsPath: string;
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
			this.showIncorrectHostFormatError(host);
			this._initHost = DEFAULT_HOST;
		} else if (
			vscode.env.remoteName &&
			vscode.env.remoteName != '' &&
			host != DEFAULT_HOST
		) {
			vscode.window.showErrorMessage(
				localize(
					'hostCannotConnect',
					'Cannot use the host "{0}" when using a remote connection. Using default {1}.',
					host,
					DEFAULT_HOST
				)
			);
			this._initHost = DEFAULT_HOST;
		} else {
			this._initHost = host;
		}

		this._httpPort = this._initHttpPort;
		this._wsPort = this._initWSPort;
		this._wsPath = '';

		this.host = this._initHost;
	}

	/**
	 * Called by the server manager to inform this object that a connection has been successful.
	 * @param httpPort HTTP server port number
	 * @param wsPort WS server port number
	 * @param wsPath WS server path
	 */
	public connected(httpPort: number, wsPort: number, wsPath: string): void {
		this._httpPort = httpPort;
		this._wsPort = wsPort;
		this._wsPath = wsPath;

		const httpPortUri = this.constructLocalUri(this._httpPort);
		const wsPortUri = this.constructLocalUri(this._wsPort, this._wsPath);

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
		this._wsPath = '';
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
			this.showIncorrectHostFormatError(host);
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
		const wsPortUri = this.constructLocalUri(this._wsPort, this._wsPath);
		return vscode.env.asExternalUri(wsPortUri);
	}

	public resetHostToDefault() {
		if (this.host != DEFAULT_HOST) {
			vscode.window.showErrorMessage(
				localize(
					'ipCannotConnect',
					'The IP address "{0}" cannot be used to host the server. Using default IP {1}.',
					this.host,
					DEFAULT_HOST
				)
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
	private constructLocalUri(port: number, path?: string) {
		return vscode.Uri.parse(`http://${this.host}:${port}${path ?? ''}`);
	}

	private showIncorrectHostFormatError(host: string) {
		vscode.window.showErrorMessage(
			localize(
				'ipAddressIncorrectFormat',
				'The local IP address "{0}" is not formatted correctly. Using default {1}.',
				host,
				DEFAULT_HOST
			)
		);
	}
}
