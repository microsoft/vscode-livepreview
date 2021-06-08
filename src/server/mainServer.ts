import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { Disposable } from '../utils/dispose';
import { PortInfo } from './serverManager';
import { ContentLoader } from './contentLoader';
import { HTMLInjector } from './HTMLInjector';


export class MainServer extends Disposable {
	private _server: any;
	private _port = 0;
	private _contentLoader: ContentLoader;
	
	constructor() {
		super();
		this._contentLoader = this._register(new ContentLoader());
	}

	private readonly _onPortChangeEmitter = this._register(
		new vscode.EventEmitter<PortInfo>()
	);
	public readonly onPortChange = this._onPortChangeEmitter.event;
	
	public start(port:number, basePath: string) {
		this._port = port;
		this.startMainServer(basePath);
	}

	public close() {
		this._server.close();
	}

	public setInjectorWSPort(ws_port:number,extensionUri?: vscode.Uri) {
		if (!this._contentLoader.scriptInjector && extensionUri) {
			this._contentLoader.scriptInjector = new HTMLInjector(extensionUri, ws_port);
		} else if (this._contentLoader.scriptInjector) {
			this._contentLoader.scriptInjector.ws_port = ws_port;
		}
	}
	private startMainServer(basePath: string): boolean {
		this._server = this.createServer(basePath);

		this._server.on('listening', () => {
			console.log(`Server is running on port ${this._port}`);
			vscode.window.showInformationMessage(
				`Server is running on port ${this._port}`
			);
			this._onPortChangeEmitter.fire({ port: this._port });
		});

		this._server.on('error', (err: any) => {
			if (err.code == 'EADDRINUSE') {
				this._port++;
				this._server.listen(this._port, '127.0.0.1');
			} else {
				console.log(`Unknown error: ${err}`);
			}
		});

		this._server.listen(this._port, '127.0.0.1');
		return true;
	}



	private createServer(basePath: string) {
		return http.createServer((req, res) => {
			if (!req || !req.url) {
				res.writeHead(500);
				res.end();
				return;
			}
			console.log(req.url);
			const endOfPath = req.url.lastIndexOf('?');
			const URLPathName =
				endOfPath == -1 ? req.url : req.url.substring(0, endOfPath);

			let absoluteReadPath = path.join(basePath, URLPathName);
			let stream;

			if (!fs.existsSync(absoluteReadPath)) {
				stream = this._contentLoader.createPageDoesNotExist(absoluteReadPath);
			} else if (fs.statSync(absoluteReadPath).isDirectory()) {
				if (!URLPathName.endsWith('/')) {
					res.statusCode = 302; // redirect to use slash
					const queries =
						endOfPath == -1 ? '' : `${req.url.substring(endOfPath)}`;
					res.setHeader('Location', URLPathName + '/' + queries);
					return res.end();
				}
				// Redirect to index.html if the request URL is a directory
				if (fs.existsSync(path.join(absoluteReadPath, 'index.html'))) {
					absoluteReadPath = path.join(absoluteReadPath, 'index.html');
					stream = this._contentLoader.getFileStream(absoluteReadPath);
				} else {
					// create a default index page
					stream = this._contentLoader.createIndexPage(absoluteReadPath, URLPathName);
				}
			} else {
				stream = this._contentLoader.getFileStream(absoluteReadPath);
			}

			if (stream) {
				stream.on('error', function () {
					res.writeHead(404);
					res.end();
				});

				stream.pipe(res);
			} else {
				res.writeHead(500);
				res.end();
			}
		});
	}

	
	
}