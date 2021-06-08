import * as vscode from 'vscode';
import { Disposable } from '../utils/dispose';
import { PageHistory, NavEditCommands } from './pageHistoryTracker';

export class BrowserPreview extends Disposable {
	public static readonly viewType = 'browserPreview';
	private readonly _pageHistory: PageHistory;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;

	private _port;
	private _wsPort;
	private readonly _onDisposeEmitter = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onDispose = this._onDisposeEmitter.event;

	public close(): void {
		this._panel.dispose();
	}

	public reveal(column: number, file = "/"): void {
		this.goToFile(file);
		this.handleNewPageLoad(file);
		this._panel.reveal(column);
	}

	public updatePortNums(port: number, wsPort: number): void {
		this._port = port;
		this._wsPort = wsPort;
		this.reloadWebview();
	}

	private get currentAddress() {
		return this._panel.title;
	}
	
	constructor(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		port: number,
		wsPort: number,
		initialFile: string,
	) {
		super();

		this._port = port;
		this._wsPort = wsPort;
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._pageHistory = this._register(new PageHistory());

		this.updateForwardBackArrows();

		// Set the webview's html content at index.html
		this.goToFile(initialFile);
		this._pageHistory?.addHistory(initialFile);
		this.setPanelTitle(initialFile);

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._register(
			this._panel.onDidDispose(() => {
				this.dispose();
			})
		);

		// Handle messages from the webview
		this._register(
			this._panel.webview.onDidReceiveMessage((message) => {
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
						this.handleOpenBrowser(message.text);
						return;
					case 'add-history':
						// called from main.js in the case where the target is non-injectable
						this.handleNewPageLoad(message.text);
						return;
				}
			})
		);

		// Update the content based on view changes
		this._register(
			this._panel.onDidChangeViewState((e) => {
				if (this._panel.visible) {
					this.updateForwardBackArrows();
				}
			})
		);
	}

	dispose() {
		this._onDisposeEmitter.fire();
		this._onDisposeEmitter.dispose();
		super.dispose();
	}

	private get _host() {
		return `http://127.0.0.1:${this._port}`;
	}

	private reloadWebview() {
		this.goToFile(this._panel.title);
	}
	
	private handleOpenBrowser(givenURL: string) {
		const urlString =
			givenURL == '' ? this.constructAddress(this._panel.title) : givenURL;
		const url = vscode.Uri.parse(urlString);
		vscode.env.openExternal(url);
		vscode.window.showInformationMessage(
			`The link ${urlString} was opened in an external browser. Externally hosted links are not supported in the embedded browser. `
		);
		this.goToFile(this.currentAddress);
		this.updateForwardBackArrows();
	}

	private updateForwardBackArrows(): void {
		const navigationStatus = this._pageHistory.currentCommands;
		for (const i in navigationStatus) {
			this.handleNavAction(navigationStatus[i]);
		}
	}

	private constructAddress(URLExt: string): string {
		if (URLExt.length > 0 && URLExt[0] == '/') {
			URLExt = URLExt.substring(1);
		}
		return `${this._host}/${URLExt}`;
	}

	private setHtml(webview: vscode.Webview, url: string): void {
		this._panel.webview.html = this.getHtmlForWebview(webview, url);
	}

	private getHtmlForWebview(webview: vscode.Webview, url: string): string {
		// Local path to main script run in the webview
		const scriptPathOnDisk = vscode.Uri.joinPath(
			this._extensionUri,
			'media',
			'main.js'
		);

		// And the uri we use to load this script in the webview
		const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

		// Local path to css styles
		const stylesPathMainPath = vscode.Uri.joinPath(
			this._extensionUri,
			'media',
			'vscode.css'
		);
		const codiconsPathMainPath = vscode.Uri.joinPath(
			this._extensionUri,
			'media',
			'codicon.css'
		);

		// Uri to load styles into webview
		const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);
		const codiconsUri = webview.asWebviewUri(codiconsPathMainPath);

		// Use a nonce to only allow specific scripts to be run
		const nonce = new Date().getTime() + '' + new Date().getMilliseconds();

		const wsURL = `ws://localhost:${this._wsPort}`;
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
				connect-src ${wsURL};
				font-src ${this._panel.webview.cspSource};
				style-src ${this._panel.webview.cspSource};
				script-src 'nonce-${nonce}';
				frame-src ${this._host};
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
				<script nonce="${nonce}">
					const WS_URL= "${wsURL}";
				</script>
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
		if (panelTitle.length > 0 && panelTitle[0] != '/') {
			return;
		}
		this.setPanelTitle(panelTitle);
		const response = this._pageHistory?.addHistory(panelTitle);
		if (response) {
			for (const i in response.actions) {
				this.handleNavAction(response.actions[i]);
			}
		}
	}

	private goToFile(URLExt: string): void {
		this.setHtml(this._panel.webview, this.constructAddress(URLExt));
	}

	private setPanelTitle(title = '/'): void {
		this._panel.title = title;
	}
}
