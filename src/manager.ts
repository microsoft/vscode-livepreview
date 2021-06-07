import { BrowserPreview } from './browserPreview';
import { Disposable } from './dispose';
import { Server } from './server';
import * as vscode from 'vscode';
import { INIT_PANEL_TITLE, CLOSE_SERVER, DONT_CLOSE, PORTNUM, WS_PORTNUM } from './constants';

export class Manager extends Disposable {
	public currentPanel: BrowserPreview | undefined;
	private readonly _server = new Server();
	private readonly _extensionUri: vscode.Uri;
	private readonly _path: vscode.WorkspaceFolder | undefined;
	private _serverPort: number = PORTNUM;
	private _serverWSPort: number = WS_PORTNUM;

	constructor(extensionUri: vscode.Uri) {
		super();
		this._extensionUri = extensionUri;
		this._path = vscode.workspace.workspaceFolders?.[0];

		this._server.onPortChange((e) => {
			if (this.currentPanel) {
				this._serverPort = e.port ?? this._serverPort;
				this._serverWSPort = e.ws_port ?? this._serverWSPort;
				this.currentPanel.updatePortNums(this._serverPort,this._serverWSPort)
			}
		});
	}

	public createOrShowPreview(
		panel: vscode.WebviewPanel | undefined = undefined
	): void {
		const currentColumn = vscode.window.activeTextEditor?.viewColumn ?? 1;
		const column = currentColumn + 1;

		// If we already have a panel, show it.
		if (this.currentPanel) {
			this.currentPanel.reveal(column);
			return;
		}

		if (!panel) {
			// Otherwise, create a new panel.
			panel = vscode.window.createWebviewPanel(
				BrowserPreview.viewType,
				INIT_PANEL_TITLE,
				column,
				getWebviewOptions(this._extensionUri)
			);
		}
		this.openServer();
		this.currentPanel = new BrowserPreview(panel, this._extensionUri, this._serverPort, this._serverWSPort);

		this.currentPanel.onDispose(() => {
			this.currentPanel = undefined;
			if (this._server.running) {
				vscode.window
					.showInformationMessage(
						'You closed the embedded preview. Would you like to also close the server?',
						CLOSE_SERVER,
						DONT_CLOSE
					)
					.then((selection: vscode.MessageItem | undefined) => {
						if (selection === CLOSE_SERVER) {
							this.closeServer(true);
						}
					});
			}
		});
	}

	public openServer(showMsgAlreadyOn = false): void {
		if (!this._server.running) {
			this._server.openServer(this._serverPort, this._serverWSPort, this._path, this._extensionUri);
		} else if (showMsgAlreadyOn) {
			vscode.window.showErrorMessage('Server already on');
		}
	}

	public closeServer(showMsgAlreadyOff = false): void {
		if (this._server.running) {
			this._server.closeServer();

			if (this.currentPanel) {
				this.currentPanel.close();
			}
			vscode.window.showInformationMessage('Closed server');
		} else if (showMsgAlreadyOff) {
			vscode.window.showErrorMessage('Server already closed');
		}
	}

	dispose() {
		this._server.closeServer();
		super.dispose();
	}
}

export function getWebviewOptions(
	extensionUri: vscode.Uri
): vscode.WebviewOptions {
	return {
		// Enable javascript in the webview
		enableScripts: true,

		// And restrict the webview to only loading content from our extension's `media` directory.
		localResourceRoots: [
			vscode.Uri.joinPath(extensionUri, 'media'),
			vscode.Uri.joinPath(
				extensionUri,
				'node_modules',
				'vscode-codicons',
				'dist'
			),
		],
	};
}
