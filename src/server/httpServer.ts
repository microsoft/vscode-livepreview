import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { Disposable } from '../utils/dispose';
import { ContentLoader } from './serverUtils/contentLoader';
import { HTMLInjector } from './serverUtils/HTMLInjector';
import { HOST } from '../utils/constants';
import { serverMsg } from '../manager';
import TelemetryReporter from 'vscode-extension-telemetry';
import { EndpointManager } from '../infoManagers/endpointManager';
import { WorkspaceManager } from '../infoManagers/workspaceManager';
import { ConnectionManager } from '../infoManagers/connectionManager';

export class HttpServer extends Disposable {
	private _server: any;
	private _contentLoader: ContentLoader;
	private readonly _extensionUri;
	public port = 0;

	constructor(
		extensionUri: vscode.Uri,
		private readonly _reporter: TelemetryReporter,
		private readonly _endpointManager: EndpointManager,
		private readonly _workspaceManager: WorkspaceManager,
		private readonly _connectionManager: ConnectionManager
	) {
		super();
		this._contentLoader = this._register(new ContentLoader(_reporter));
		this._extensionUri = extensionUri;
	}

	private get _basePath() {
		return this._workspaceManager.workspacePath;
	}

	private readonly _onConnected = this._register(
		new vscode.EventEmitter<number>()
	);
	public readonly onConnected = this._onConnected.event;

	private readonly _onNewReqProcessed = this._register(
		new vscode.EventEmitter<serverMsg>()
	);
	public readonly onNewReqProcessed = this._onNewReqProcessed.event;

	public hasServedFile(file: string) {
		return this._contentLoader.servedFiles.indexOf(file) > -1;
	}

	public start(port: number) {
		this.port = port;
		this._contentLoader.resetServedFiles();
		this.startHttpServer();
	}

	public close() {
		this._server.close();
	}

	public refreshInjector() {
		if (!this._contentLoader.scriptInjector) {
			this._contentLoader.scriptInjector = new HTMLInjector(
				this._extensionUri,
				this._connectionManager
			);
		} else {
			this._contentLoader.scriptInjector.refresh();
		}
	}

	private startHttpServer(): boolean {
		this._server = this.createServer();

		this._server.on('listening', () => {
			console.log(`Server is running on port ${this.port}`);
			this._onConnected.fire(this.port);
		});

		this._server.on('error', (err: any) => {
			if (err.code == 'EADDRINUSE') {
				this.port++;
				this._server.listen(this.port, HOST);
			} else {
				/* __GDPR__
					"server.err" : { 
						"type": {"classification": "SystemMetaData", "purpose": "FeatureInsight"},
						"err": {"classification": "CallstackOrException", "purpose": "PerformanceAndHealth"}
					}
				*/
				this._reporter.sendTelemetryErrorEvent('server.err', {
					type: 'http',
					err: err,
				});
				console.log(`Unknown error: ${err}`);
			}
		});

		this._server.listen(this.port, HOST);
		return true;
	}

	private serveStream(
		basePath: string,
		req: http.IncomingMessage,
		res: http.ServerResponse
	) {
		if (!req || !req.url) {
			this.reportAndReturn(500, req, res);
			return;
		}

		const endOfPath = req.url.lastIndexOf('?');
		let URLPathName =
			endOfPath == -1 ? req.url : req.url.substring(0, endOfPath);

		URLPathName = unescape(URLPathName);
		let stream;
		let looseFile = false;
		let absoluteReadPath = path.join(basePath, URLPathName);
		let contentType = 'application/octet-stream';

		if (URLPathName.startsWith('/endpoint_unsaved')) {
			const untitledFileName = URLPathName.substr(
				URLPathName.lastIndexOf('/') + 1
			);
			const content = this._contentLoader.getFileStream(
				untitledFileName,
				false
			);
			if (content.Stream) {
				stream = content.Stream;
				contentType = content.ContentType ?? '';
				res.writeHead(200, { 'Content-Type': `${contentType}; charset=UTF-8` });
				stream.pipe(res);
				return;
			}
		}

		if (!fs.existsSync(absoluteReadPath)) {
			const decodedReadPath =
				this._endpointManager.decodeLooseFileEndpoint(URLPathName);
			looseFile = true;
			if (decodedReadPath && fs.existsSync(decodedReadPath)) {
				absoluteReadPath = decodedReadPath;
			} else {
				const respInfo =
					this._contentLoader.createPageDoesNotExist(absoluteReadPath);
				res.writeHead(404);
				this.reportStatus(req, res);
				stream = respInfo.Stream;
				stream?.pipe(res);
				return;
			}
		}

		if (fs.statSync(absoluteReadPath).isDirectory()) {
			if (!URLPathName.endsWith('/')) {
				const queries =
					endOfPath == -1 ? '' : `${req.url.substring(endOfPath)}`;
				res.setHeader('Location', `${URLPathName}/${queries}`);
				this.reportAndReturn(302, req, res); // redirect
				return;
			}
			// Redirect to index.html if the request URL is a directory
			if (fs.existsSync(path.join(absoluteReadPath, 'index.html'))) {
				absoluteReadPath = path.join(absoluteReadPath, 'index.html');
				const respInfo = this._contentLoader.getFileStream(absoluteReadPath);
				stream = respInfo.Stream;
				contentType = respInfo.ContentType ?? '';
			} else {
				// create a default index page
				const respInfo = this._contentLoader.createIndexPage(
					absoluteReadPath,
					URLPathName,
					looseFile
						? this._endpointManager.getEndpointParent(URLPathName)
						: undefined
				);
				stream = respInfo.Stream;
				contentType = respInfo.ContentType ?? '';
			}
		} else {
			const respInfo = this._contentLoader.getFileStream(absoluteReadPath);
			stream = respInfo.Stream;
			contentType = respInfo.ContentType ?? '';
		}

		if (stream) {
			stream.on('error', () => {
				this.reportAndReturn(500, req, res);
				return;
			});
			res.writeHead(200, { 'Content-Type': `${contentType}; charset=UTF-8` });
			stream.pipe(res);
		} else {
			this.reportAndReturn(500, req, res);
			return;
		}

		this.reportStatus(req, res);
		return;
	}

	private createServer() {
		return http.createServer((req, res) =>
			this.serveStream(this._basePath ?? '', req, res)
		);
	}

	private reportAndReturn(
		status: number,
		req: http.IncomingMessage,
		res: http.ServerResponse
	) {
		res.writeHead(status);
		this.reportStatus(req, res);
		res.end();
	}

	private reportStatus(req: http.IncomingMessage, res: http.ServerResponse) {
		this._onNewReqProcessed.fire({
			method: req.method ?? '',
			url: req.url ?? '',
			status: res.statusCode,
		});
	}
}
