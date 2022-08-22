import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { Disposable } from '../utils/dispose';
import { ContentLoader } from './serverUtils/contentLoader';
import { INJECTED_ENDPOINT_NAME } from '../utils/constants';
import TelemetryReporter from 'vscode-extension-telemetry';
import { EndpointManager } from '../infoManagers/endpointManager';
import { PathUtil } from '../utils/pathUtil';
import { Connection } from '../connectionInfo/connection';
import { serverMsg } from './serverManager';

export class HttpServer extends Disposable {
	private _server: any;
	private _contentLoader: ContentLoader;

	private readonly _onConnected = this._register(
		new vscode.EventEmitter<number>()
	);

	public readonly onConnected = this._onConnected.event;

	private readonly _onNewReqProcessed = this._register(
		new vscode.EventEmitter<serverMsg>()
	);
	public readonly onNewReqProcessed = this._onNewReqProcessed.event;

	constructor(
		_extensionUri: vscode.Uri,
		private readonly _reporter: TelemetryReporter,
		private readonly _endpointManager: EndpointManager,
		private readonly _connection: Connection
	) {
		super();
		this._contentLoader = this._register(
			new ContentLoader(_extensionUri, _reporter, _endpointManager, _connection)
		);
	}

	/**
	 * @returns {string | undefined} the path where the server index is located.
	 */
	private get _basePath(): string | undefined {
		return this._connection.workspacePath;
	}

	/**
	 * @param {string} file file to check
	 * @returns {boolean} whether the HTTP server has served `file` since last reset or beginning of extension activation.
	 */
	public hasServedFile(file: string) {
		if (this._contentLoader.servedFiles) {
			for (const item of this._contentLoader.servedFiles.values()) {
				if (PathUtil.PathEquals(file, item)) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * @description start the HTTP server.
	 * @param {number} port port to try to start server on.
	 */
	public start(port: number): void {
		this._connection.httpPort = port;
		this._contentLoader.resetServedFiles();
		this._startHttpServer();
	}

	/**
	 * @description stop the HTTP server.
	 */
	public close() {
		this._server.close();
	}

	/**
	 * @description contains all of the listeners required to start the server and recover on port collision.
	 * @returns {boolean} whether the HTTP server started successfully (currently only returns true)
	 */
	private _startHttpServer(): boolean {
		this._server = this._createServer();

		this._server.on('listening', () => {
			console.log(`Server is running on port ${this._connection.httpPort}`);
			this._onConnected.fire(this._connection.httpPort);
		});

		this._server.on('error', (err: any) => {
			if (err.code == 'EADDRINUSE') {
				this._connection.httpPort++;
				this._server.listen(this._connection.httpPort, this._connection.host);
			} else if (err.code == 'EADDRNOTAVAIL') {
				this._connection.resetHostToDefault();
				this._server.listen(this._connection.httpPort, this._connection.host);
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

		this._server.listen(this._connection.httpPort, this._connection.host);
		return true;
	}

	/**
	 * @description contains the logic for content serving.
	 * @param {string | undefined} basePath the path where the server index is located.
	 * @param {http.IncomingMessage} req the request received
	 * @param {http.ServerResponse} res the response to be loaded
	 */
	private _serveStream(
		basePath: string | undefined,
		req: http.IncomingMessage,
		res: http.ServerResponse
	): void {
		if (!req || !req.url) {
			this._reportAndReturn(500, req, res);
			return;
		}

		let stream;
		if (req.url == INJECTED_ENDPOINT_NAME) {
			const respInfo = this._contentLoader.loadInjectedJS();
			const contentType = respInfo.ContentType ?? '';
			res.writeHead(200, {
				'Accept-Ranges': 'bytes',
				'Content-Type': contentType,
			});
			stream = respInfo.Stream;
			stream?.pipe(res);
			return;
		}
		const endOfPath = req.url.lastIndexOf('?');
		let URLPathName =
			endOfPath == -1 ? req.url : req.url.substring(0, endOfPath);

		if (!basePath && (URLPathName == '/' || URLPathName == '')) {
			const respInfo = this._contentLoader.createNoRootServer();
			res.writeHead(404, {
				'Accept-Ranges': 'bytes',
				'Content-Type': respInfo.ContentType,
			});
			this._reportStatus(req, res);
			stream = respInfo.Stream;

			stream?.pipe(res);
			return;
		}

		let looseFile = false;
		URLPathName = decodeURI(URLPathName);
		let absoluteReadPath = path.join(basePath ?? '', URLPathName);

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
				res.writeHead(200, {
					'Accept-Ranges': 'bytes',
					'Content-Type': contentType,
				});
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
				res.writeHead(404, {
					'Accept-Ranges': 'bytes',
					'Content-Type': respInfo.ContentType,
				});
				this._reportStatus(req, res);
				stream = respInfo.Stream;
				stream?.pipe(res);
				return;
			}
		}

		if (fs.statSync(absoluteReadPath).isDirectory()) {
			if (!URLPathName.endsWith('/')) {
				const queries =
					endOfPath == -1 ? '' : `${req.url.substring(endOfPath)}`;

				URLPathName = encodeURI(URLPathName);
				res.setHeader('Location', `${URLPathName}/${queries}`);
				this._reportAndReturn(302, req, res); // redirect
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
				this._reportAndReturn(500, req, res);
				return;
			});
			res.writeHead(200, {
				'Accept-Ranges': 'bytes',
				'Content-Type': contentType,
			});
			stream.pipe(res);
		} else {
			this._reportAndReturn(500, req, res);
			return;
		}

		this._reportStatus(req, res);
		return;
	}

	/**
	 * @returns the created HTTP server with the serving logic.
	 */
	private _createServer(): http.Server {
		return http.createServer((req, res) =>
			this._serveStream(this._basePath, req, res)
		);
	}

	/**
	 * @description write the status to the header, send data for logging, then end.
	 * @param {number} status the status returned
	 * @param {http.IncomingMessage} req the request object
	 * @param {http.ServerResponse} res the response object
	 */
	private _reportAndReturn(
		status: number,
		req: http.IncomingMessage,
		res: http.ServerResponse
	): void {
		res.writeHead(status);
		this._reportStatus(req, res);
		res.end();
	}

	/**
	 * @description send the server logging information to the terminal logging task.
	 * @param {http.IncomingMessage} req the request object
	 * @param {http.ServerResponse} res the response object
	 */
	private _reportStatus(req: http.IncomingMessage, res: http.ServerResponse) {
		this._onNewReqProcessed.fire({
			method: req.method ?? '',
			url: req.url ?? '',
			status: res.statusCode,
		});
	}
}
