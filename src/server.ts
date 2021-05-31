import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as WebSocket from 'ws';
import * as Stream from 'stream';
import { Disposable } from './dispose';
import { PORTNUM, WS_PORTNUM, WS_PORTNUM_PLACEHOLDER } from './constants';
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
	private readonly _port = PORTNUM;
	private readonly _ws_port = WS_PORTNUM;
	private _server: any;
	private _isServerOn = false;
	private _wss: any;

	constructor() {
		super();

		this._register(
			vscode.workspace.onDidChangeTextDocument((e) => {
				this.refreshBrowsers();
			})
		);
		this._register(
			vscode.workspace.onDidRenameFiles((e) => {
				this.refreshBrowsers();
			})
		);
	}

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
		path: vscode.WorkspaceFolder | undefined,
		extensionUri: vscode.Uri | undefined
	): void {
		if (path && extensionUri) {
			const success = this.start(path.uri.fsPath, extensionUri);
			if (success) {
				this._isServerOn = true;
			}
		}
	}

	private start(basePath: string, extensionUri: vscode.Uri): boolean {
		const scriptInjection = this.getHTMLInjection(extensionUri);

		this._server = http
			.createServer((req: any, res: any) => {
				const endOfPath = req.url.lastIndexOf('?');
				const URLPathName =
					endOfPath == -1 ? req.url : req.url.substring(0, endOfPath);

				let absoluteReadPath = path.join(basePath, URLPathName);
				let stream;

				if (!fs.existsSync(absoluteReadPath)) {
					stream = this.createPageDoesNotExist(
						absoluteReadPath,
						scriptInjection
					);
				} else if (fs.statSync(absoluteReadPath).isDirectory()) {
					// Redirect to index.html if the request URL is a directory
					if (fs.existsSync(path.join(absoluteReadPath, 'index.html'))) {
						absoluteReadPath = path.join(absoluteReadPath, 'index.html');
						stream = this.getStream(absoluteReadPath, scriptInjection);
					} else {
						stream = this.createIndexStream(
							absoluteReadPath,
							URLPathName,
							scriptInjection
						);
					}
				} else {
					stream = this.getStream(absoluteReadPath, scriptInjection);
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
			.listen(this._port);
		// for websockets
		this._wss = new WebSocket.Server({ port: this._ws_port });
		this._wss.on('connection', (ws: any) => {
			ws.on('message', (message: string) => {
				const parsedMessage = JSON.parse(message);
				switch (parsedMessage.command) {
					case 'urlCheck': {
						const results = this.performTargetInjectableCheck(basePath,parsedMessage.url);
						if (!results.injectable) {
							ws.send(
								`{"command":"foundNonInjectable","path":"${results.pathname}"}`
							);
						}
					}
				}
			});
		});
		return true;
	}

	private performTargetInjectableCheck(basePath: string, urlString: string): {'injectable':boolean, 'pathname': string} {
		
		const url = new URL(urlString);
		const absolutePath = path.join(basePath, url.pathname);
		if (
			fs.statSync(absolutePath).isDirectory() ||
			path.extname(absolutePath) == '.html'
		) {
			return {'injectable':true,'pathname':url.pathname};
		}
		return {'injectable':false,'pathname':url.pathname};
	}

	private end(): boolean {
		this._server.close();
		if (this._wss != null) {
			this._wss.close();
		}

		return true; // TODO: find error conditions and return false when needed
	}

	private createPageDoesNotExist(
		relativePath: string,
		scriptInjection: string
	): Stream.Readable {
		const htmlString = `
		<!DOCTYPE html>
		<html>
			<body style="font-family:calibri">
			<h1>File not found</h1>
			<p>The file <b>"${relativePath}"</b> cannot be found. It may have been moved, edited, or deleted.</p>
			</body>
			${scriptInjection}
		</html>
		`;

		return Stream.Readable.from(htmlString);
	}

	private createIndexStream(
		readPath: string,
		relativePath: string,
		scriptInjection: string
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
				<td><a href="${elem.LinkSrc}">${elem.LinkName}/</a></td>
				<td>${elem.FileSize}</td>
				<td>${elem.DateTime}</td>
				</tr>\n`)
		);

		const htmlString = `
		<!DOCTYPE html>
		<html>
			<head>
				<style>
					body {
						font-family:calibri;
					}
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
			${scriptInjection}
		</html>
		`;

		return Stream.Readable.from(htmlString);
	}

	private getHTMLInjection(extensionUri: vscode.Uri): string {
		const scriptPath = path.join(
			extensionUri.fsPath,
			'media',
			'inject_script.js'
		);
		const buffer = fs.readFileSync(scriptPath);
		const bufString = buffer
			.toString()
			.replace(WS_PORTNUM_PLACEHOLDER, this._ws_port.toString());
		return '<script>\n' + bufString + '\n</script>';
	}

	private refreshBrowsers(): void {
		this._wss.clients.forEach((client: any) => client.send('reload'));
	}

	private getStream(
		readPath: string,
		scriptInjection: string
	): Stream.Readable | fs.ReadStream | undefined {
		const workspaceDocuments = vscode.workspace.textDocuments;

		let i = 0;
		let stream;
		while (i < workspaceDocuments.length) {
			if (readPath == workspaceDocuments[i].fileName) {
				let fileContents = workspaceDocuments[i].getText();

				if (readPath.endsWith('.html')) {
					fileContents = this.injectNotifier(fileContents, scriptInjection);
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
					buffer.toString(),
					scriptInjection
				);
				stream = Stream.Readable.from(injectedFileContents);
			} else {
				stream = fs.createReadStream(readPath);
			}
		}

		return stream;
	}

	private injectNotifier(contents: string, scriptInjection: string): string {
		const re = '</htmls*>';
		const locationHeadEnd = contents.search(re);

		if (locationHeadEnd == -1) {
			// add html tags if the file doesn't have a proper closing tag
			return '<html>\n' + contents + scriptInjection + '\n</html>';
		}

		const newContents =
			contents.substr(0, locationHeadEnd) +
			scriptInjection +
			contents.substr(locationHeadEnd);
		return newContents;
	}
}
