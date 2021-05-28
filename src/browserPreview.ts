import * as vscode from 'vscode';
import { PORTNUM } from './constants';
import { Disposable } from './dispose';
import { pageHistory, NavEditCommands } from './pageHistoryTracker';

export class BrowserPreview extends Disposable {
	public static readonly viewType = 'browserPreview';
	private readonly _pageHistory: pageHistory;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;

	private readonly _onDisposeEmitter = this._register(new vscode.EventEmitter<void>());
	public readonly onDispose = this._onDisposeEmitter.event;

	public close(): void {
		this._panel.dispose();
	}

	public reveal(column: number): void {
		this._panel.reveal(column);
	}

	constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		super();
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._pageHistory = this._register(new pageHistory());

		this.updateForwardBackArrows();

		// Set the webview's html content at index.html
		this.goToFile("/");
		this._pageHistory?.addHistory("/");
		this.setPanelTitle();

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._register(this._panel.onDidDispose(() => {
			this.dispose();
		}));

		// Handle messages from the webview
		this._register(this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'alert':
						vscode.window.showErrorMessage(message.text);
						return;
					case 'update-path':
						this.handleNewPageLoad(message.text);
						return;
					case 'go-back':
						this.goBack();
						return;
					case 'go-forward':
						this.goForwards();
						return;
					case 'open-browser':
						const urlString = (message.text == '') ? this.constructHostAddress(this._panel.title) : message.text;
						const url = vscode.Uri.parse(urlString);
						vscode.env.openExternal(url);
						return;
				}
			}
		));

		// Update the content based on view changes
		this._register(this._panel.onDidChangeViewState(
			e => {
				if (this._panel.visible) {
					this.updateForwardBackArrows();
				}
			}));

	}

	dispose() {
		this._onDisposeEmitter.fire();
		this._onDisposeEmitter.dispose();
		super.dispose();
	}

	private updateForwardBackArrows(): void {
		const navigationStatus = this._pageHistory.currentCommands;
		for (const i in navigationStatus) {
			this.handleNavAction(navigationStatus[i]);
		}
	}

	private constructHostAddress(URLExt: string): string {
		if (URLExt.length > 0 && URLExt[0] == "/") {
			URLExt = URLExt.substring(1);
		}

		return `http://localhost:${PORTNUM}/${URLExt}`;
	}

	private setHtml(webview: vscode.Webview, url: string): void {
		this._panel.webview.html = this.getHtmlForWebview(webview, url);
	}

	private getHtmlForWebview(webview: vscode.Webview, url: string): string {
		// Local path to main script run in the webview
		const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js');

		// And the uri we use to load this script in the webview
		const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

		// Local path to css styles
		const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css');
		const codiconsPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'vscode-codicons', 'dist', 'codicon.css');

		// Uri to load styles into webview
		const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);
		const codiconsUri = webview.asWebviewUri(codiconsPathMainPath);

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

				<link href="${stylesMainUri}" rel="stylesheet">
				<link rel="stylesheet" type="text/css" href="${codiconsUri}">

				<title>LocalHost Preview</title>
			</head>
			<body>
			<div class="displayContents">
				<div class="header">
					<div class="headercontent">
						<nav class="controls">
							<button
								id="back"
								title="Back"
								class="back-button icon"><i class="codicon codicon-arrow-left"></i></button>

							<button
								id="forward"
								title="Forward"
								class="forward-button icon"><i class="codicon codicon-arrow-right"></i></button>

							<button
								id="reload"
								title="Reload"
								class="reload-button icon"><i class="codicon codicon-refresh"></i></button>
							<button
								id="browserOpen"
								title="Open in browser"
								class="open-external-button icon"><i class="codicon codicon-link-external"></i></button>
						</nav>
					</div>
				</div>
				<div class="content">
					<iframe id="hostedContent" src="${url}" sandbox="allow-scripts allow-forms allow-same-origin"></iframe>
				</div>
			</div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
		</html>`;
	}

	private goForwards(): void {
		const response = this._pageHistory.goForward();

		const pagename = response.address;
		if (pagename != undefined) {
			this.goToFile(pagename);
		}

		for (const i in response.actions) {
			this.handleNavAction(response.actions[i]);
		}
	}

	private goBack(): void {
		const response = this._pageHistory.goBackward();

		const pagename = response.address;
		if (pagename != undefined) {
			this.goToFile(pagename);
		}
		for (const i in response.actions) {
			this.handleNavAction(response.actions[i]);
		}
	}

	private handleNavAction(command: NavEditCommands): void {
		switch (command) {
			case NavEditCommands.DISABLE_BACK:
				this._panel.webview.postMessage({ command: 'disable-back' });
				break;
			case NavEditCommands.ENABLE_BACK:
				this._panel.webview.postMessage({ command: 'enable-back' });
				break;
			case NavEditCommands.DISABLE_FORWARD:
				this._panel.webview.postMessage({ command: 'disable-forward' });
				break;
			case NavEditCommands.ENABLE_FORWARD:
				this._panel.webview.postMessage({ command: 'enable-forward' });
				break;
		}
	}

	private handleNewPageLoad(panelTitle: string): void {
		// only load relative addresses
		if (panelTitle[0] != '/') {
			return;
		}

		this.setPanelTitle(panelTitle.substring(1));

		const response = this._pageHistory?.addHistory(panelTitle);
		if (response) {
			for (const i in response.actions) {
				this.handleNavAction(response.actions[i]);
			}
		}
	}

	private goToFile(URLExt: string): void {
		this.setHtml(this._panel.webview, this.constructHostAddress(URLExt));
	}

	private setPanelTitle(title = ""): void {
		title = title == "" ? "index.html" : title;
		this._panel.title = title;
	}
}


