import { BrowserPreview } from "./browserPreview";
import { Disposable } from "./dispose";
import { Server, PORTNUM } from './server'
import * as vscode from 'vscode';


export const CLOSE_SERVER: vscode.MessageItem = {
	title: "Close Server"
};

export const DONT_CLOSE: vscode.MessageItem = {
	title: "Don't Close"
};

export class Manager extends Disposable {
	public currentPanel: BrowserPreview | undefined = undefined;
	public server = new Server();
	private readonly _extensionUri: vscode.Uri;
	private readonly _path: vscode.WorkspaceFolder | undefined;

	constructor(extensionUri: vscode.Uri) {
		super();
		this._extensionUri = extensionUri;
		this._path = vscode.workspace.workspaceFolders?.[0];
	}

	public createOrShowPreview(panel: vscode.WebviewPanel | undefined  = undefined) {
		
		if (!panel) {

			const currentColumn = vscode.window.activeTextEditor?.viewColumn ?? 1;
			const column = currentColumn + 1;
	
			// If we already have a panel, show it.
			if (this.currentPanel) {
				this.currentPanel.panel.reveal(column);
				return;
			}
	
			// Otherwise, create a new panel.
			panel = vscode.window.createWebviewPanel(
				BrowserPreview.viewType,
				'LocalHost Preview',
				column,
				getWebviewOptions(this._extensionUri),
			);
		}
		this.openServer()
		this.currentPanel = new BrowserPreview(panel, this._extensionUri);

		this.currentPanel.onDispose(() => {
			this.currentPanel = undefined;
			vscode.window
                .showInformationMessage(
                    "You closed the embedded preview. Would you like to also close the server?",
                    CLOSE_SERVER,
					DONT_CLOSE
                )
                .then((selection: vscode.MessageItem | undefined) => {
                    if (selection === CLOSE_SERVER) {
                        this.server.closeServer();
                    }
                });
		});

	}
	
	public openServer(showMsg:boolean = false) {
		// open server
		
		if (!this.server.running) {
			const openSuccessful = this.server.openServer(this._path, this._extensionUri);
			
			if (!openSuccessful) {
				vscode.window.showErrorMessage("Failed to start server. Please try again.");
				return
			}
		} else if (showMsg) {
			vscode.window.showErrorMessage("Server already on");	
		}
	}

	dispose() {
		this.server.closeServer();
		super.dispose();
	}

}

export function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
	return {
		// Enable javascript in the webview
		enableScripts: true,

		// And restrict the webview to only loading content from our extension's `media` directory.
		localResourceRoots: [
			vscode.Uri.joinPath(extensionUri, 'media'),
			vscode.Uri.joinPath(extensionUri, 'node_modules','vscode-codicons','dist')
		]
	};
}