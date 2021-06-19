import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { Disposable } from '../utils/dispose';
import { ContentLoader } from './serverUtils/contentLoader';
import { HTMLInjector } from './serverUtils/HTMLInjector';
import { HOST } from '../utils/constants';
import { serverMsg } from '../manager';
import { isFileInjectable } from '../utils/utils';

export class HttpServer extends Disposable {
	private _server: any;
	private _contentLoader: ContentLoader;
	public port = 0;

	constructor() {
		super();
		this._contentLoader = this._register(new ContentLoader());
	}

	private readonly _onConnected = this._register(
		new vscode.EventEmitter<number>()
	);
	public readonly onConnected = this._onConnected.event;

	private readonly _onNewReqProcessed = this._register(
		new vscode.EventEmitter<serverMsg>()
	);
	public readonly onNewReqProcessed = this._onNewReqProcessed.event;

	public start(port: number, basePath: string) {
		this.port = port;
		this.startHttpServer(basePath);
	}

	public close() {
		this._server.close();
	}

	public setInjectorWSPort(ws_port: number, extensionUri?: vscode.Uri) {
		if (!this._contentLoader.scriptInjector && extensionUri) {
			this._contentLoader.scriptInjector = new HTMLInjector(
				extensionUri,
				ws_port
			);
		} else if (this._contentLoader.scriptInjector) {
			this._contentLoader.scriptInjector.ws_port = ws_port;
		}
	}
	private startHttpServer(basePath: string): boolean {
		this._server = this.createServer(basePath);

		this._server.on('listening', () => {
			console.log(`Server is running on port ${this.port}`);
			this._onConnected.fire(this.port);
		});

		this._server.on('error', (err: any) => {
			if (err.code == 'EADDRINUSE') {
				this.port++;
				this._server.listen(this.port, HOST);
			} else {
				console.log(`Unknown error: ${err}`);
			}
		});

		this._server.listen(this.port, HOST);
		return true;
	}

	private createServer(basePath: string) {
		return http.createServer((req, res) => {
			if (!req || !req.url) {
				res.writeHead(500);
				res.end();
				return;
			}
			const endOfPath = req.url.lastIndexOf('?');
			const URLPathName =
				endOfPath == -1 ? req.url : req.url.substring(0, endOfPath);

			let absoluteReadPath = path.join(basePath, URLPathName);
			let stream;

			if (!fs.existsSync(absoluteReadPath)) {

				stream = this._contentLoader.decodeUrlPath(URLPathName);
				if (!stream) {
					stream = this._contentLoader.createPageDoesNotExist(absoluteReadPath);
					res.writeHead(404);
					this.reportStatus(req, res);
					stream.pipe(res);
					return;
				}
			} else if (fs.statSync(absoluteReadPath).isDirectory()) {
				if (!URLPathName.endsWith('/')) {
					const queries =
						endOfPath == -1 ? '' : `${req.url.substring(endOfPath)}`;
					res.setHeader('Location', `${URLPathName}/${queries}`);
					res.writeHead(302); // redirect to use slash

					this.reportStatus(req, res);
					return res.end();
				}
				// Redirect to index.html if the request URL is a directory
				if (fs.existsSync(path.join(absoluteReadPath, 'index.html'))) {
					absoluteReadPath = path.join(absoluteReadPath, 'index.html');
					stream = this._contentLoader.getFileStream(absoluteReadPath);
				} else {
					// create a default index page
					stream = this._contentLoader.createIndexPage(
						absoluteReadPath,
						URLPathName
					);
				}
			} else {
				stream = this._contentLoader.getFileStream(absoluteReadPath);
			}

			if (stream) {
				stream.on('error', () => {
					res.writeHead(404);
					this.reportStatus(req, res);
					res.end();
					return;
				});
				
				// explicitly set text/html for html files to allow for special character rendering
				let contentType = 'charset=UTF-8';

				if (isFileInjectable(absoluteReadPath) || absoluteReadPath.endsWith('svg')) {
					contentType = 'text/html; ' + contentType;
				}
				res.writeHead(200, { 'Content-Type': contentType });
				stream.pipe(res);
			} else {
				res.writeHead(500);
				res.end();
			}

			this.reportStatus(req, res);
			return;
		});
	}

	private reportStatus(req: http.IncomingMessage, res: http.ServerResponse) {
		this._onNewReqProcessed.fire({
			method: req.method ?? '',
			url: req.url ?? '',
			status: res.statusCode,
		});
	}
}
