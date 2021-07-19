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
import { HOST, UriSchemes } from '../utils/constants';
import { ConnectionManager } from '../infoManagers/connectionManager';

export class WSServerWithOriginCheck extends WebSocket.Server {
	public externalHostName: string | undefined;

	shouldHandle(req: http.IncomingMessage): boolean {
		const origin = req.headers['origin'];
		return <boolean>(
			(origin &&
				(origin.startsWith(UriSchemes.vscode_webview) ||
					(this.externalHostName && origin == this.externalHostName)))
		);
	}
}

export class WSServer extends Disposable {
	private _wss: WSServerWithOriginCheck | undefined;
	private _ws_port = 0;

	public set externalHostName(hostName: string) {
		if (this._wss) {
			this._wss.externalHostName = hostName;
		}
	}

	constructor(
		private readonly _reporter: TelemetryReporter,
		private readonly _endpointManager: EndpointManager,
		private readonly _workspaceManager: WorkspaceManager,
		_connectionManager: ConnectionManager
	) {
		super();

		this._register(
			_connectionManager.onConnected((e) => {
				this.externalHostName = `${e.httpURI.scheme}://${e.httpURI.authority}`;
			})
		);
	}

	private get _basePath() {
		return this._workspaceManager.workspacePath;
	}

	public get ws_port() {
		return this._ws_port;
	}

	public set ws_port(portNum: number) {
		this._ws_port = portNum;
	}

	private readonly _onConnected = this._register(
		new vscode.EventEmitter<number>()
	);
	public readonly onConnected = this._onConnected.event;

	public start(ws_port: number) {
		this._ws_port = ws_port;
		this.startWSServer(this._basePath ?? '');
	}

	public close() {
		if (this._wss != null) {
			this._wss.close();
		}
	}

	private startWSServer(basePath: string): boolean {
		this._wss = new WSServerWithOriginCheck({
			port: this._ws_port,
			host: HOST,
		});
		this._wss.on('connection', (ws: WebSocket) =>
			this.handleWSConnection(basePath, ws)
		);
		this._wss.on('error', (err: Error) => this.handleWSError(basePath, err));
		this._wss.on('listening', () => this.handleWSListen());
		return true;
	}

	private handleWSError(basePath: string, err: any) {
		if (err.code == 'EADDRINUSE') {
			this._ws_port++;
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

	private handleWSListen() {
		console.log(`Websocket server is running on port ${this._ws_port}`);
		this._onConnected.fire(this._ws_port);
	}

	private handleWSConnection(basePath: string, ws: WebSocket) {
		ws.on('message', (message: string) => {
			const parsedMessage = JSON.parse(message);
			switch (parsedMessage.command) {
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

	public refreshBrowsers(): void {
		if (this._wss) {
			this._wss.clients.forEach((client: any) =>
				client.send(JSON.stringify({ command: 'reload' }))
			);
		}
	}
}
