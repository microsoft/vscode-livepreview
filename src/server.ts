import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Disposable } from './dispose';
import * as WebSocket from 'ws';


export const PORTNUM = 3000;
export const WS_PORTNUM = 3500;

export class Server extends Disposable {
	private readonly _port = PORTNUM
	private readonly _ws_port = WS_PORTNUM
	private _server: any;
	private _isServerOn: boolean = false;
	private wss: any;
	private readonly Readable = require('stream').Readable;
	private _WS_PORTNUM_PLACEHOLDER = "${WS_PORTNUM}"

	constructor() {
		super();
		
		this._register(vscode.workspace.onDidChangeTextDocument(e => {
			this.refreshBrowsers();
		}));
	}

	public get running() {
		return this._isServerOn;
	}
	public closeServer() {
		if (this._isServerOn) {
			this.end()
			this._isServerOn = false;
			vscode.window.showInformationMessage("Closed Server");
		} else {
			vscode.window.showErrorMessage("Server Already Closed");
		}
	}

	public openServer(path: vscode.WorkspaceFolder | undefined, extensionUri: vscode.Uri | undefined): boolean {
		if (path && extensionUri) {
			const success = this.start(path.uri.fsPath, extensionUri)
			if (!success) {
				this._isServerOn = false;
				return false;
			}
			vscode.window.showInformationMessage("Started Server");
			this._isServerOn = true;
			return true;
		}
		this._isServerOn = false;
		return false;
	}

	private start(basePath: string, extensionUri: vscode.Uri): boolean {

		const buffer = fs.readFileSync(path.join(extensionUri.fsPath,"media","inject_script.js"));
		const bufString = buffer.toString().replace(this._WS_PORTNUM_PLACEHOLDER, this._ws_port.toString())
		const scriptInjection = "<script>\n" + bufString + "\n</script>"

		this._server = http.createServer((req: any, res: any) => {
			const endOfPath = req.url.lastIndexOf("?")
			const pathnameWithoutQueries = endOfPath == -1 ? req.url : req.url.substring(0, endOfPath)

			let fileurl = pathnameWithoutQueries;
			if ((pathnameWithoutQueries == '/' || pathnameWithoutQueries == '') && fs.existsSync(path.join(basePath, "index.html"))) {
				fileurl = 'index.html';
			}

			const readPath = path.join(basePath, fileurl);
			const stream = this.getStream(readPath, scriptInjection)

			stream.on('error', function () {
				res.writeHead(404);
				res.end();
			});

			stream.pipe(res);
		}).listen(this._port);
		// for websockets
		this.wss = new WebSocket.Server({ port: this._ws_port })

		console.log("started server")
		return true;
	}

	private refreshBrowsers() {
		this.wss.clients.forEach((client: any) => client.send("reload"));
	}

	private getStream(readPath: string, scriptInjection: string) {
		var workspaceDocuments = vscode.workspace.textDocuments;

		var i = 0;
		var stream;
		while (i < workspaceDocuments.length) {
			if (readPath == workspaceDocuments[i].fileName) {
				var text = workspaceDocuments[i].getText()
				stream = this.Readable.from(this.injectNotifier(text, scriptInjection));
				break;
			}
			i++
		}

		if (i == workspaceDocuments.length) {
			if (readPath.endsWith(".html")) {
				const buffer = fs.readFileSync(readPath);
				stream = this.Readable.from(this.injectNotifier(buffer.toString(), scriptInjection));
			} else {
				stream = fs.createReadStream(readPath);
			}
		}

		return stream
	}

	private injectNotifier(contents: string, scriptInjection: string) {
		const re = "</html\s*>";
		const locationHeadEnd = contents.search(re);

		if (locationHeadEnd == -1) {
			return "<html>\n" + contents + scriptInjection + "\n</html>"
		} else {
			let newContents = contents.substr(0, locationHeadEnd) + scriptInjection + contents.substr(locationHeadEnd)
			return newContents;
		}
	}


	private end(): void {
		this._server.close()
		if (this.wss != null) {
			this.wss.close()
		}
		console.log("closed server")
	}

}
