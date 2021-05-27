// import { Server } from 'http';
import * as vscode from 'vscode';
import { PORTNUM } from './server'
import { Disposable } from './dispose';
import { pageHistory, NavEditCommands } from './pageHistoryTracker';

export class BrowserPreview extends Disposable {
	/**
	 * Track the currently panel. Only allow a single panel to exist at a time.
	 */
	public static readonly viewType = 'localhostBrowserPreview';
	// public static currentPanel: BrowserPreview | undefined;
	// public static server = new Server();

	private readonly _pageHistory: pageHistory;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;


	public get panel() {
		return this._panel;
	}
	constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		super()
		this._panel = panel;
		this._extensionUri = extensionUri;

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._register(this._panel.onDidDispose(() => {
			this.dispose();
		}));

		this._pageHistory = this._register(new pageHistory());
		this.handleNavAction(NavEditCommands.DISABLE_BACK)
		this.handleNavAction(NavEditCommands.DISABLE_FORWARD)

		// Handle messages from the webview
		this._register(this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'alert':
						vscode.window.showErrorMessage(message.text);
						return;
					case 'update-path':
						this.handleNewPageLoad(message.text)
						return;
					case 'go-back':
						this.goBack();
						return
					case 'go-forward':
						this.goForwards();
						return
					case 'open-browser':
						const urlString = (message.text == '') ? "http://localhost:" + PORTNUM + "/" + this._panel.title : message.text;
						const url = vscode.Uri.parse(urlString);
						vscode.env.openExternal(url);
						return
				}
			}
		));


		// Set the webview's initial html content
		this.goToFile("/");
		this._pageHistory?.addHistory("/")

		this.setPanelTitle();
	}

	dispose() {
		this._onDisposeEmitter.fire();
		this._onDisposeEmitter.dispose();
		super.dispose()
	}
	
	private readonly _onDisposeEmitter = this._register(new vscode.EventEmitter<void>());
	public readonly onDispose = this._onDisposeEmitter.event;

	private _setHtml(webview: vscode.Webview, url: string) {
		this._panel.webview.html = this._getHtmlForWebview(webview, url);
	}

	private _getHtmlForWebview(webview: vscode.Webview, url: string) {
		// Local path to main script run in the webview
		const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js');

		// And the uri we use to load this script in the webview
		const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

		// Local path to css styles
		const styleResetPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css');
		const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css');
		const codiconsPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'vscode-codicons', 'dist', 'codicon.css');

		// Uri to load styles into webview
		const stylesResetUri = webview.asWebviewUri(styleResetPath);
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

				<link href="${stylesResetUri}" rel="stylesheet">
				<link href="${stylesMainUri}" rel="stylesheet">
				<link rel="stylesheet" type="text/css" href="${codiconsUri}">

				<title>LocalHost Preview</title>


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
			</head>
			<body>
			
				<!-- <a>bloop</a> -->
				<iframe id="hostedContent" src="${url}" sandbox="allow-scripts allow-forms allow-same-origin"></iframe>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}

	public goForwards() {
		const response = this._pageHistory.goForward();

		const pagename = response.address;
		if (pagename != undefined) {
			this.goToFile(pagename)
		}

		for (const i in response.actions) {
			this.handleNavAction(response.actions[i])
		}
	}

	public goBack() {
			const response = this._pageHistory.goBackward();

			const pagename = response.address;
			if (pagename != undefined) {
				this.goToFile(pagename)
			}
			for (const i in response.actions) {
				this.handleNavAction(response.actions[i])
			}
	}

	public handleNavAction(command: NavEditCommands) {
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

	public handleNewPageLoad(panelTitle: string) {
		// only load relative addresses
		if (panelTitle[0] != '/') {
			return;
		}

		this.setPanelTitle(panelTitle.substring(1));

		const response = this._pageHistory?.addHistory(panelTitle)
		if (response) {
			for (const i in response.actions) {
				this.handleNavAction(response.actions[i])
			}
		}

	}

	public refreshIFrame() {
		this._panel.webview.postMessage({ command: 'refresh' });
	}

	public goToFile(URLExt: string) {
		console.log("going to " + URLExt)
		this._setHtml(this._panel.webview, "http://localhost:" + PORTNUM + URLExt);

	}

	public setPanelTitle(title: string = ""): void {
		title = title == "" ? "index.html" : title
		this._panel.title = title;
	}

	public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		vscode.commands.executeCommand('liveserver.start')
		return new BrowserPreview(panel, extensionUri);
	}
	
}


