import * as vscode from 'vscode';
import * as server from './server'

export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(
		vscode.commands.registerCommand('server.start', ()  => {
			BrowserPanel.createOrShow(context.extensionUri);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('server.end', ()  => {
			server.end()
			vscode.window.showInformationMessage("ended server");
		})
	);

	if (vscode.window.registerWebviewPanelSerializer) {
		vscode.window.registerWebviewPanelSerializer(BrowserPanel.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
				// Reset the webview options so we use latest uri for `localResourceRoots`.
				webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
				BrowserPanel.revive(webviewPanel, context.extensionUri);
			}
		});

	}


}


function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
	return {
		// Enable javascript in the webview
		enableScripts: true,

		// And restrict the webview to only loading content from our extension's `media` directory.
		localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
	};
}


class BrowserPanel {
	/**
	 * Track the currently panel. Only allow a single panel to exist at a time.
	 */
	public static currentPanel: BrowserPanel | undefined;

	public static readonly viewType = 'localhostBrowserPanel';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];


	public static createOrShow(extensionUri: vscode.Uri) {
		const column = vscode.ViewColumn.Two; //TODO: use new column

		// If we already have a panel, show it.
		if (BrowserPanel.currentPanel) {
			BrowserPanel.currentPanel._panel.reveal(column);
			return;
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			BrowserPanel.viewType,
			'LocalHost Preview',
			column,
			getWebviewOptions(extensionUri),
		);

		BrowserPanel.currentPanel = new BrowserPanel(panel, extensionUri);
	}

	public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		BrowserPanel.currentPanel = new BrowserPanel(panel, extensionUri);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		const currentWorkspace: vscode.WorkspaceFolder | undefined = vscode.workspace.workspaceFolders?.[0];
		if (currentWorkspace) {
			server.start(currentWorkspace.uri.fsPath)
			vscode.window.showInformationMessage("started server");
		}

		// Set the webview's initial html content
		this._setHtml(panel.webview,"http://127.0.0.1:3000");

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Update the content based on view changes
		this._panel.onDidChangeViewState(
			e => {
				if (this._panel.visible) {
					this._update();
				}
			},
			null,
			this._disposables
		);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'alert':
						vscode.window.showErrorMessage(message.text);
						return;
				}
			},
			null,
			this._disposables
		);

	}

	public doRefactor() {
		// Send a message to the webview webview.
		// You can send any JSON serializable data.
		this._panel.webview.postMessage({ command: 'refactor' });
	}

	public dispose() {
		BrowserPanel.currentPanel = undefined;

		server.end()
		vscode.window.showInformationMessage("ended server");
		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _update() {
		// this._setHtml(this._panel.webview,"http://127.0.0.1:3000");
		console.log("updated")
	}

	private _setHtml(webview: vscode.Webview, url: string) {
		this._panel.title = "LocalHost Preview";
		this._panel.webview.html = this._getHtmlForWebview(webview,url);
	}

	private _getHtmlForWebview(webview: vscode.Webview, url: string) {

		// Local path to css styles
		const styleResetPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css');
		const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css');

		// Uri to load styles into webview
		const stylesResetUri = webview.asWebviewUri(styleResetPath);
		const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);

		// Use a nonce to only allow specific scripts to be run
		const nonce = new Date().getTime() + '' + new Date().getMilliseconds();

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">

				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="
				default-src 'none';
				font-src ${this._panel.webview.cspSource};
				style-src ${this._panel.webview.cspSource};
				script-src 'nonce-${nonce}';
				frame-src *;
				">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${stylesResetUri}" rel="stylesheet">
				<link href="${stylesMainUri}" rel="stylesheet">

				<title>LocalHost Preview</title>
			</head>
			<body>

				<iframe src="http://localhost:3000/" sandbox="allow-scripts allow-forms allow-same-origin"></iframe>
				
			</body>
			</html>`;
	}
}

