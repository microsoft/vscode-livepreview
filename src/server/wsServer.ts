import * as vscode from 'vscode';
import * as WebSocket from 'ws';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import { Disposable } from '../utils/dispose';
import { isFileInjectable } from '../utils/utils';
import TelemetryReporter from 'vscode-extension-telemetry';
import { EndpointManager } from '../infoManagers/endpointManager';
import { WorkspaceManager } from '../infoManagers/workspaceManager';
import { UriSchemes } from '../utils/constants';
import { ConnectionManager } from '../infoManagers/connectionManager';
import { serverPortAttributesProvider } from './serverPortAttributesProvider';

/**
 * @description override the `Websocket.Server` class to check websocket connection origins;
 * connections should only be coming from the webview or the host address.
 */
export class WSServerWithOriginCheck extends WebSocket.Server {
	public externalHostName: string | undefined;

	/**
	 * @param {http.IncomingMessage} req the incoming request to connect
	 * @returns {boolean} whether or not to allow the request
	 */
	public shouldHandle(req: http.IncomingMessage): boolean {
		const origin = req.headers['origin'];
		return <boolean>(
			(origin &&
				(origin.startsWith(UriSchemes.vscode_webview) ||
					(this.externalHostName && origin == this.externalHostName)))
		);
	}
}

/**
 * @description the websocket server, usually hosted on the port following the HTTP server port.
 * It serves two purposes:
 * - Messages from the server to the clients tell it to refresh when there are changes. The requests occur in `ServerManager`, but use this websocket server.
 * - Messages from the client to the server check the "injectability" of the file that is being navigated to. This only occurs in the webview (embedded preview).
 * 	Being "injectable" means that we can inject our custom script into the file. The injectable script has the following **main** roles:
 * 			1. Facilitates live refresh.
 *			2. Relays the current address to the webview from inside of the iframe. Without the injected script, the extension preview cannot properly handle history or display the address/title of the page in the webview.
 *			3. Checks new links for injectability, although this case isn't currently handled since non-html files are unlikely to have hyperlinks.
 * 			4. Overrides the console to pipe console messages to the output channel.
 *
 * Only #2 needs to be handled for non-injectable files, since the others are unecessary for non-html files.
 * To handle displaying the information and handling history correctly, the client (when inside of a webview) will
 * let the websocket server know where it is navigating to before going there. If the address it is going to is non-injectable,
 * then the extension will relay the address to the `BrowserPreview` instance containing the embedded preview to provide the appropriate information and refresh the history.
 */
export class WSServer extends Disposable {
	private _wss: WSServerWithOriginCheck | undefined;
	private _wsPort = 0;

	public set externalHostName(hostName: string) {
		if (this._wss) {
			this._wss.externalHostName = hostName;
		}
	}

	constructor(
		private readonly _reporter: TelemetryReporter,
		private readonly _endpointManager: EndpointManager,
		private readonly _workspaceManager: WorkspaceManager,
		private readonly _connectionManager: ConnectionManager,
		private readonly _portAttributes: serverPortAttributesProvider
	) {
		super();

		this._register(
			_connectionManager.onConnected((e) => {
				this.externalHostName = `${e.httpURI.scheme}://${e.httpURI.authority}`;
			})
		);
	}

	/**
	 * @description the location of the workspace.
	 */
	private get _basePath(): string | undefined {
		return this._workspaceManager.workspacePath;
	}

	public get wsPort() {
		return this._wsPort;
	}

	public set wsPort(portNum: number) {
		this._portAttributes.wsPort = portNum;
		this._wsPort = portNum;
	}

	// once connected, we must let the server manager know, as it needs to know when both servers are ready.
	private readonly _onConnected = this._register(
		new vscode.EventEmitter<number>()
	);
	public readonly onConnected = this._onConnected.event;

	/**
	 * @description Start the websocket server.
	 * @param {number} wsPort the port to try to connect to.
	 */
	public start(wsPort: number): void {
		this.wsPort = wsPort;
		this.startWSServer(this._basePath ?? '');
	}

	/**
	 * @description Close the websocket server.
	 */
	public close(): void {
		if (this._wss != null) {
			this._wss.close();
		}
	}

	/**
	 * @description send a message to all connected clients to refresh the page.
	 */
	public refreshBrowsers(): void {
		if (this._wss) {
			this._wss.clients.forEach((client: any) =>
				client.send(JSON.stringify({ command: 'reload' }))
			);
		}
	}

	/**
	 * @param {string} basePath the path where the server index is hosted.
	 * @returns {boolean} whether the server has successfully started.
	 */
	private startWSServer(basePath: string): boolean {
		this._wss = new WSServerWithOriginCheck({
			port: this._wsPort,
			host: this._connectionManager.host,
		});
		this._wss.on('connection', (ws: WebSocket) =>
			this.handleWSConnection(basePath, ws)
		);
		this._wss.on('error', (err: Error) => this.handleWSError(basePath, err));
		this._wss.on('listening', () => this.handleWSListen());
		return true;
	}

	/**
	 * @param {string} basePath the path where the server index is hosted.
	 * @param {any} err the error received.
	 */
	private handleWSError(basePath: string, err: any): void {
		if (err.code == 'EADDRINUSE') {
			this.wsPort++;
			this.startWSServer(basePath);
		} else if (err.code == 'EADDRNOTAVAIL') {
			this._connectionManager.resetHostToDefault();
			this.startWSServer(basePath);
		} else {
			/* __GDPR__
				"server.err" : { 
					"type": {"classification": "SystemMetaData", "purpose": "FeatureInsight"},
					"err": {"classification": "CallstackOrException", "purpose": "PerformanceAndHealth"}
				}
			*/
			this._reporter.sendTelemetryErrorEvent('server.err', {
				type: 'ws',
				err: err,
			});
			console.log(`Unknown error: ${err}`);
		}
	}

	/**
	 * @description handle the websocket successfully connecting.
	 */
	private handleWSListen(): void {
		console.log(`Websocket server is running on port ${this.wsPort}`);
		this._onConnected.fire(this.wsPort);
	}

	/**
	 * @description Handle messages from the clients.
	 * @param {string} basePath the path where the server index is hosted.
	 * @param {WebSocket} ws the websocket server instance.
	 */
	private handleWSConnection(basePath: string, ws: WebSocket): void {
		ws.on('message', (message: string) => {
			const parsedMessage = JSON.parse(message);
			switch (parsedMessage.command) {
				// perform the url check
				case 'urlCheck': {
					const results = this.performTargetInjectableCheck(
						basePath,
						parsedMessage.url
					);
					if (!results.injectable) {
						/* __GDPR__
							"server.ws.foundNonInjectable" : {}
						*/
						this._reporter.sendTelemetryEvent('server.ws.foundNonInjectable');
						const sendData = {
							command: 'foundNonInjectable',
							path: results.pathname,
						};
						ws.send(JSON.stringify(sendData));
					}
				}
			}
		});
	}

	/**
	 * @description check URL injectability.
	 * @param {string} basePath the path where the server index is hosted.
	 * @param {string} urlString url to check
	 * @returns {boolean,string} info on injectability, in addition to the pathname
	 * 	in case it needs to be forwarded to the webview.
	 */
	private performTargetInjectableCheck(
		basePath: string,
		urlString: string
	): { injectable: boolean; pathname: string } {
		const url = new URL(urlString);
		let absolutePath = path.join(basePath, url.pathname);

		if (!fs.existsSync(absolutePath)) {
			const decodedLocation =
				this._endpointManager.decodeLooseFileEndpoint(absolutePath);
			if (!decodedLocation || !fs.existsSync(decodedLocation)) {
				return { injectable: false, pathname: url.pathname };
			} else {
				absolutePath = decodedLocation;
			}
		}

		if (
			fs.statSync(absolutePath).isDirectory() ||
			isFileInjectable(absolutePath)
		) {
			return { injectable: true, pathname: url.pathname };
		}
		return { injectable: false, pathname: url.pathname };
	}
}
