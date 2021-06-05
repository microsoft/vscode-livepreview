import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as WebSocket from 'ws';
import * as Stream from 'stream';
import { Disposable } from './dispose';
import { WS_PORTNUM_PLACEHOLDER } from './constants';
import { URL } from 'url';
import { FormatFileSize, FormatDateTime } from './utils';

export interface IndexFileEntry {
	LinkSrc: string;
	LinkName: string;
	FileSize: string;
	DateTime: string;
}

export interface IndexDirEntry {
	LinkSrc: string;
	LinkName: string;
	DateTime: string;
}

export class Server extends Disposable {
	private _server: any;
	private _isServerOn = false;
	private _wss: any;
	private _scriptInjection = ``; // TODO: turn script injector into object that keeps state of changes to reduce disk reads
	private _ws_port = 0;
	private _port = 0;

	constructor() {
		super();

		this._register(
			vscode.workspace.onDidChangeTextDocument((e) => {
				if (e.contentChanges && e.contentChanges.length > 0) {
					this.refreshBrowsers();
				}
			})
		);
		this._register(
			vscode.workspace.onDidRenameFiles((e) => {
				this.refreshBrowsers();
			})
		);
		this._register(
			vscode.workspace.onDidDeleteFiles((e) => {
				this.refreshBrowsers();
			})
		);
		this._register(
			vscode.workspace.onDidCreateFiles((e) => {
				this.refreshBrowsers();
			})
		);
	}

	
	private readonly _onPortChangeEmitter = this._register(
		new vscode.EventEmitter<{'port'?:number,'ws_port'?:number}>()
	);
	public readonly onPortChange = this._onPortChangeEmitter.event;

	public get running(): boolean {
		return this._isServerOn;
	}

	public closeServer(): void {
		const success = this.end();
		if (success) {
			this._isServerOn = false;
		}
	}

	public openServer(
		port:number,
		ws_port:number,
		path: vscode.WorkspaceFolder | undefined,
		extensionUri: vscode.Uri | undefined
	): void {
		if (path && extensionUri) {
			this._scriptInjection = this.getHTMLInjection(ws_port, extensionUri);
			this._ws_port = ws_port
			this._port = port
			const success = this.start(path.uri.fsPath, extensionUri);
			if (success) {
				this._isServerOn = true;
			}
		}
	}


	private startMainServer(basePath: string): boolean {
		const originalPort = this._port;

		this._server = this.createServer(basePath);
			
		this._server.on('listening', () =>{
			console.log(`server is running on port ${this._port}`);
			if (this._port != originalPort) {
				this._onPortChangeEmitter.fire({'port':this._port})
			}
		});

		this._server.on('error',(err:any) =>{
			if(err.code == 'EADDRINUSE') {
				console.log(`port ${this._port} in use. Trying ${this._port+1}`)
				this._port++;
				this._server.listen(this._port,"127.0.0.1");
			} else {
				console.log(`Unknown error: ${err}`)
			}
		});

		this._server.listen(this._port,"127.0.0.1");
		return true
	}


	private startWSServer(basePath: string,extensionUri: vscode.Uri):boolean {
		this._wss = new WebSocket.Server({ port: this._ws_port });
		this._wss.on('connection', (ws: any) => this.handleWSConnection(basePath,ws));
		this._wss.on('error',(err:any) => this.handleWSCollision(basePath,extensionUri, err));
		return true
	}

	private handleWSCollision(basePath: string,extensionUri: vscode.Uri, err:any) {
		if(err.code == 'EADDRINUSE') {
			console.log(`ws port ${this._ws_port} in use. Trying ${this._ws_port+1}`)
			this._ws_port++;
			this.startWSServer(basePath,extensionUri);
			this.handleWSOpen(extensionUri)
		} else {
			console.log(`Unknown error: ${err}`)
		}
	}

	private handleWSOpen(extensionUri:vscode.Uri)  {
		this._onPortChangeEmitter.fire({'ws_port':this._ws_port})
		this._scriptInjection = this.getHTMLInjection(this._ws_port,extensionUri)
	}

	private handleWSConnection(basePath:string, ws: any) {
		ws.on('message', (message: string) => {
			const parsedMessage = JSON.parse(message);
			switch (parsedMessage.command) {
				case 'urlCheck': {
					const results = this.performTargetInjectableCheck(basePath, parsedMessage.url);
					if (!results.injectable) {
						ws.send(
							`{"command":"foundNonInjectable","path":"${results.pathname}"}`
						);
					}
				}
			}
		});
	}

	private start(basePath: string, extensionUri: vscode.Uri): boolean {
		return this.startMainServer(basePath) && this.startWSServer(basePath,extensionUri); 
	}
	private createServer(basePath: string) {
		return http
		.createServer((req: any, res: any) => {
			const endOfPath = req.url.lastIndexOf('?');
			const URLPathName =
				endOfPath == -1 ? req.url : req.url.substring(0, endOfPath);

			let absoluteReadPath = path.join(basePath, URLPathName);
			let stream;

			if (!fs.existsSync(absoluteReadPath)) {
				stream = this.createPageDoesNotExist(
					absoluteReadPath
				);
			} else if (fs.statSync(absoluteReadPath).isDirectory()) {
				// Redirect to index.html if the request URL is a directory
				if (fs.existsSync(path.join(absoluteReadPath, 'index.html'))) {
					absoluteReadPath = path.join(absoluteReadPath, 'index.html');
					stream = this.getStream(absoluteReadPath);
				} else {
					// create a default index page
					stream = this.createIndexStream(
						absoluteReadPath,
						URLPathName
					);
				}
			} else {
				stream = this.getStream(absoluteReadPath);
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
		})
	}


	private end(): boolean {
		this._server.close();
		if (this._wss != null) {
			this._wss.close();
		}

		return true; // TODO: find error conditions and return false when needed
	}

	private performTargetInjectableCheck(basePath: string, urlString: string): { 'injectable': boolean, 'pathname': string } {

		const url = new URL(urlString);
		const absolutePath = path.join(basePath, url.pathname);
		if (
			fs.statSync(absolutePath).isDirectory() ||
			path.extname(absolutePath) == '.html'
		) {
			return { 'injectable': true, 'pathname': url.pathname };
		}
		return { 'injectable': false, 'pathname': url.pathname };
	}

	private createPageDoesNotExist(
		relativePath: string
	): Stream.Readable {
		// TODO: make look better
		const htmlString = `
		<!DOCTYPE html>
		<html>
			<body>
			<h1>File not found</h1>
			<p>The file <b>"${relativePath}"</b> cannot be found. It may have been moved, edited, or deleted.</p>
			</body>
			${this._scriptInjection}
		</html>
		`;

		return Stream.Readable.from(htmlString);
	}

	private createIndexStream(
		readPath: string,
		relativePath: string
	): Stream.Readable {
		const childFiles = fs.readdirSync(readPath);

		const fileEntries = new Array<IndexFileEntry>();
		const dirEntries = new Array<IndexDirEntry>();

		if (relativePath != '/') {
			dirEntries.push({ LinkSrc: '/../', LinkName: '..', DateTime: '' });
		}

		for (const i in childFiles) {
			const relativeFileWithChild = path.join(relativePath, childFiles[i]);
			const absolutePath = path.join(readPath, childFiles[i]);

			const fileStats = fs.statSync(absolutePath);
			const modifiedDateTimeString = FormatDateTime(fileStats.mtime);

			if (fileStats.isDirectory()) {
				dirEntries.push({
					LinkSrc: relativeFileWithChild,
					LinkName: childFiles[i],
					DateTime: modifiedDateTimeString,
				});
			} else {
				const fileSize = FormatFileSize(fileStats.size);
				fileEntries.push({
					LinkSrc: relativeFileWithChild,
					LinkName: childFiles[i],
					FileSize: fileSize,
					DateTime: modifiedDateTimeString,
				});
			}
		}

		let directoryContents = '';

		dirEntries.forEach(
			(elem: IndexDirEntry) =>
			(directoryContents += `
				<tr>
				<td><a href="${elem.LinkSrc}">${elem.LinkName}/</a></td>
				<td></td>
				<td>${elem.DateTime}</td>
				</tr>\n`)
		);

		fileEntries.forEach(
			(elem: IndexFileEntry) =>
			(directoryContents += `
				<tr>
				<td><a href="${elem.LinkSrc}">${elem.LinkName}</a></td>
				<td>${elem.FileSize}</td>
				<td>${elem.DateTime}</td>
				</tr>\n`)
		);

		const htmlString = `
		<!DOCTYPE html>
		<html>
			<head>
				<style>
					table td {
						padding:4px;
					}
				</style>
			</head>
			<body>
			<h1>Index of ${relativePath}</h1>

			<table>
				<th>Name</th><th>Size</th><th>Date Modified</th>
				${directoryContents}
			</table>
			</body>
			${this._scriptInjection}
		</html>
		`;

		return Stream.Readable.from(htmlString);
	}

	private getHTMLInjection(ws_port:number, extensionUri: vscode.Uri): string {
		const scriptPath = path.join(
			extensionUri.fsPath,
			'media',
			'inject_script.js'
		);
		const buffer = fs.readFileSync(scriptPath);
		const bufString = buffer
			.toString()
			.replace(WS_PORTNUM_PLACEHOLDER, ws_port.toString());
		return '<script>\n' + bufString + '\n</script>';
	}

	private refreshBrowsers(): void {
		this._wss.clients.forEach((client: any) => client.send(
			`{"command":"reload"}`));
	}

	private getStream(
		readPath: string
	): Stream.Readable | fs.ReadStream | undefined {
		const workspaceDocuments = vscode.workspace.textDocuments;

		let i = 0;
		let stream;
		while (i < workspaceDocuments.length) {
			if (readPath == workspaceDocuments[i].fileName) {
				let fileContents = workspaceDocuments[i].getText();

				if (readPath.endsWith('.html')) {
					fileContents = this.injectNotifier(fileContents);
				}

				stream = Stream.Readable.from(fileContents);
				break;
			}
			i++;
		}

		if (i == workspaceDocuments.length) {
			if (readPath.endsWith('.html')) {
				const buffer = fs.readFileSync(readPath);
				const injectedFileContents = this.injectNotifier(
					buffer.toString()
				);
				stream = Stream.Readable.from(injectedFileContents);
			} else {
				stream = fs.createReadStream(readPath);
			}
		}

		return stream;
	}

	private injectNotifier(contents: string): string {
		const re = '</htmls*>';
		const locationHeadEnd = contents.search(re);

		if (locationHeadEnd == -1) {
			// add html tags if the file doesn't have a proper closing tag
			return '<html>\n' + contents + this._scriptInjection + '\n</html>';
		}

		const newContents =
			contents.substr(0, locationHeadEnd) +
			this._scriptInjection +
			contents.substr(locationHeadEnd);
		return newContents;
	}
}
