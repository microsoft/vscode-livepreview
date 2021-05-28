import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as WebSocket from 'ws';
import * as Stream from 'stream';
import { Disposable } from './dispose';
import { PORTNUM, WS_PORTNUM, WS_PORTNUM_PLACEHOLDER } from './constants';


export class Server extends Disposable {
	private readonly _port = PORTNUM;
	private readonly _ws_port = WS_PORTNUM;
	private _server: any;
	private _isServerOn = false;
	private _wss: any;

	constructor() {
		super();

		this._register(vscode.workspace.onDidChangeTextDocument(e => {
			this.refreshBrowsers();
		}));
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

	public openServer(path: vscode.WorkspaceFolder | undefined, extensionUri: vscode.Uri | undefined): void {
		if (path && extensionUri) {
			const success = this.start(path.uri.fsPath, extensionUri);
			if (success) {
				this._isServerOn = true;
			}
		}
	}

	private start(basePath: string, extensionUri: vscode.Uri): boolean {

		const scriptInjection = this.getHTMLInjection(extensionUri);

		this._server = http.createServer((req: any, res: any) => {
			const endOfPath = req.url.lastIndexOf("?");
			let pathnameWithoutQueries = endOfPath == -1 ? req.url : req.url.substring(0, endOfPath);

			const queries = endOfPath == -1 ? "": req.url.substring(endOfPath+1);
			console.log(queries)
			
			let readPath = path.join(basePath, pathnameWithoutQueries)
			let stream;
			// Redirect to index.html if the request URL is blank
			if (fs.statSync(readPath).isDirectory()) {
				if (fs.existsSync(path.join(readPath, "index.html"))) {
					readPath = path.join(readPath,'index.html');
					stream = this.getStream(readPath, scriptInjection);
				} else {
					stream = this.createIndexStream(readPath, pathnameWithoutQueries,scriptInjection);
				}
			} else {
				stream = this.getStream(readPath, scriptInjection);
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

		}).listen(this._port);
		// for websockets
		this._wss = new WebSocket.Server({ port: this._ws_port });

		console.log("started server");
		return true;
	}

	private end(): boolean {
		this._server.close();
		if (this._wss != null) {
			this._wss.close();
		}
		console.log("closed server");

		return true; // TODO: find error conditions and return false when needed
	}

	private createIndexStream(readPath: string, relativePath: string, scriptInjection: string): Stream.Readable {

		const childFiles = fs.readdirSync(readPath)
		let directoryContents = "";
		for (const i in childFiles) {
			directoryContents += `<tr><td>> <a href="${path.join(relativePath,childFiles[i]) + "?needsInjection"}">${childFiles[i]}/</a></td></tr>\n`;
		}
		
		const htmlString = `
		<!DOCTYPE html>
		<html>
			<body style="font-family:calibri">
			<h1>Index of ${relativePath}</h1>
			<table>
			${directoryContents}
			</table>
			</body>
			${scriptInjection}
		</html>
		`

		return Stream.Readable.from(htmlString);
	}
	private getHTMLInjection(extensionUri: vscode.Uri): string {
		const scriptPath = path.join(extensionUri.fsPath, "media", "inject_script.js");
		const buffer = fs.readFileSync(scriptPath);
		const bufString = buffer.toString().replace(WS_PORTNUM_PLACEHOLDER, this._ws_port.toString());
		return "<script>\n" + bufString + "\n</script>";
	}

	private refreshBrowsers(): void {
		this._wss.clients.forEach((client: any) => client.send("reload"));
	}

	private getStream(readPath: string, scriptInjection: string): Stream.Readable | fs.ReadStream | undefined {
		const workspaceDocuments = vscode.workspace.textDocuments;

		let i = 0;
		let stream;
		while (i < workspaceDocuments.length) {
			if (readPath == workspaceDocuments[i].fileName) {
				let fileContents = workspaceDocuments[i].getText();

				if (readPath.endsWith(".html")) {
					fileContents = this.injectNotifier(fileContents, scriptInjection);
				}

				stream = Stream.Readable.from(fileContents);
				break;
			}
			i++;
		}

		if (i == workspaceDocuments.length) {
			if (readPath.endsWith(".html")) {
				const buffer = fs.readFileSync(readPath);
				const injectedFileContents = this.injectNotifier(buffer.toString(), scriptInjection);
				stream = Stream.Readable.from(injectedFileContents);
			} else {
				stream = fs.createReadStream(readPath);
			}
		}

		return stream;
	}

	private injectNotifier(contents: string, scriptInjection: string): string {
		const re = "<\/html\s*>";
		const locationHeadEnd = contents.search(re);

		if (locationHeadEnd == -1) {
			// add html tags if the file doesn't have a proper closing tag
			return "<html>\n" + contents + scriptInjection + "\n</html>";
		}

		const newContents = contents.substr(0, locationHeadEnd) + scriptInjection + contents.substr(locationHeadEnd);
		return newContents;
	}

	// private indexHtmlFile() {

	// }

}
