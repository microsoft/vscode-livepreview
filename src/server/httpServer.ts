/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as Stream from 'stream';
import { Disposable } from '../utils/dispose';
import { ContentLoader } from './serverUtils/contentLoader';
import { COOP_COEP_HEADERS, INJECTED_ENDPOINT_NAME } from '../utils/constants';
import TelemetryReporter from 'vscode-extension-telemetry';
import { EndpointManager } from '../infoManagers/endpointManager';
import { PathUtil } from '../utils/pathUtil';
import { Connection } from '../connectionInfo/connection';
import { IServerMsg } from './serverGrouping';
import { SETTINGS_SECTION_ID, SettingUtil } from '../utils/settingsUtil';

export class HttpServer extends Disposable {
	private _server: any;
	private _contentLoader: ContentLoader;
	private _defaultHeaders: http.OutgoingHttpHeaders;

	private readonly _onConnected = this._register(
		new vscode.EventEmitter<number>()
	);

	public readonly onConnected = this._onConnected.event;

	private readonly _onNewReqProcessed = this._register(
		new vscode.EventEmitter<IServerMsg>()
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
		this._defaultHeaders = this.getUpdatedDefaultHeaders();

		this._register(
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration(SETTINGS_SECTION_ID)) {
					this._defaultHeaders = this.getUpdatedDefaultHeaders();
				}
			})
		);
	}

	private getUpdatedDefaultHeaders(): http.OutgoingHttpHeaders {
		return SettingUtil.GetConfig().supportCrossOriginIsolation ?
			{
				'Accept-Ranges': 'bytes',
				...COOP_COEP_HEADERS
			} :
			{ 'Accept-Ranges': 'bytes' };
	}

	/**
	 * @returns {string | undefined} the path where the server index is located.
	 */
	private get _basePath(): string {
		return this._connection.rootPath ?? '';
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
	public close(): void {
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
	 * @param {string} basePath the path where the server index is located.
	 * @param {http.IncomingMessage} req the request received
	 * @param {http.ServerResponse} res the response to be loaded
	 */
	private async _serveStream(
		basePath: string,
		req: http.IncomingMessage,
		res: http.ServerResponse
	): Promise<void> {
		if (!req || !req.url) {
			this._reportAndReturn(500, req, res);
			return;
		}

		const expectedUri = await this._connection.resolveExternalHTTPUri();
		const expectedHost = expectedUri.authority;
		if (
			(req.headers.host !== 'localhost' &&
				req.headers.host !== this._connection.host &&
				req.headers.host !== expectedHost) ||
			(req.headers.origin &&
				req.headers.origin !== `${expectedUri.scheme}://${expectedHost}`)
		) {
			this._reportAndReturn(401, req, res); // unauthorized
			return;
		}

		let stream: Stream.Readable | fs.ReadStream | undefined;
		if (req.url === INJECTED_ENDPOINT_NAME) {
			const respInfo = this._contentLoader.loadInjectedJS();
			const contentType = respInfo.ContentType ?? '';
			res.writeHead(200, {
				'Content-Type': contentType,
				...this._defaultHeaders
			});
			stream = respInfo.Stream;
			stream?.pipe(res);
			return;
		}
		// can't use vscode.Uri.joinPath because that doesn't parse out the query
		const urlObj = vscode.Uri.parse(
			`${expectedUri.scheme}://${expectedUri.authority}${req.url}`
		);

		let URLPathName = urlObj.path;

		// start processing URL

		const writePageNotFound = (noServerRoot = false): void => {
			const respInfo = noServerRoot ?
				this._contentLoader.createNoRootServer() :
				this._contentLoader.createPageDoesNotExist(absoluteReadPath);
			res.writeHead(404, {
				'Content-Type': respInfo.ContentType,
				...this._defaultHeaders
			});
			this._reportStatus(req, res);
			stream = respInfo.Stream;
			stream?.pipe(res);
		};

		if (basePath === '' && (URLPathName === '/' || URLPathName === '')) {
			writePageNotFound(true);
			return;
		}

		let looseFile = false;
		URLPathName = decodeURI(URLPathName);
		let absoluteReadPath = path.join(basePath, URLPathName);

		let contentType = 'application/octet-stream';
		if (basePath === '') {
			if (URLPathName.startsWith('/endpoint_unsaved')) {
				const untitledFileName = URLPathName.substring(
					URLPathName.lastIndexOf('/') + 1
				);
				const content = await this._contentLoader.getFileStream(
					untitledFileName,
					false
				);
				if (content.Stream) {
					stream = content.Stream;
					contentType = content.ContentType ?? '';
					res.writeHead(200, {
						'Content-Type': contentType,
						...this._defaultHeaders
					});
					stream.pipe(res);
					return;
				}
			}

			const decodedReadPath =
				await this._endpointManager.decodeLooseFileEndpoint(URLPathName);
			looseFile = true;
			if (
				decodedReadPath &&
				(await PathUtil.FileExistsStat(decodedReadPath)).exists
			) {
				absoluteReadPath = decodedReadPath;
			} else {
				writePageNotFound();
				return;
			}
		} else if (!PathUtil.PathBeginsWith(absoluteReadPath, basePath)) {
			// double-check that we aren't serving parent files.

			// if this server's workspace is undefined, the the path is already checked because
			// the resolved path is already a child of the endpoint if it is to be decoded.
			absoluteReadPath = basePath;
		}

		// path should be valid now
		const absPathExistsStatInfo = await PathUtil.FileExistsStat(absoluteReadPath);
		if (!absPathExistsStatInfo.exists) {
			writePageNotFound();
			return;
		}
		if (absPathExistsStatInfo.stat && absPathExistsStatInfo.stat.isDirectory()) {
			if (!URLPathName.endsWith('/')) {
				const queries = urlObj.query;
				URLPathName = encodeURI(URLPathName);
				res.setHeader('Location', `${URLPathName}/?${queries}`);
				this._reportAndReturn(302, req, res); // redirect
				return;
			}

			// Redirect to index.html if the request URL is a directory
			if ((await PathUtil.FileExistsStat(path.join(absoluteReadPath, 'index.html'))).exists) {
				absoluteReadPath = path.join(absoluteReadPath, 'index.html');
				const respInfo = await this._contentLoader.getFileStream(absoluteReadPath);
				stream = respInfo.Stream;
				contentType = respInfo.ContentType ?? '';
			} else {
				// create a default index page
				const respInfo = await this._contentLoader.createIndexPage(
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
			const respInfo = await this._contentLoader.getFileStream(absoluteReadPath);
			stream = respInfo.Stream;
			contentType = respInfo.ContentType ?? '';
		}

		if (stream) {
			stream.on('error', () => {
				this._reportAndReturn(500, req, res);
				return;
			});
			res.writeHead(200, {
				'Content-Type': contentType,
				...this._defaultHeaders
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
	private _reportStatus(
		req: http.IncomingMessage,
		res: http.ServerResponse
	): void {
		this._onNewReqProcessed.fire({
			method: req.method ?? '',
			url: req.url ?? '',
			status: res.statusCode,
		});
	}
}
