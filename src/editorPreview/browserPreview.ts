import * as vscode from 'vscode';
import { HOST, INIT_PANEL_TITLE, OPEN_EXTERNALLY } from '../utils/constants';
import { Disposable } from '../utils/dispose';
import { isFileInjectable } from '../utils/utils';
import { PathUtil } from '../utils/pathUtil';
import { PageHistory, NavEditCommands } from './pageHistoryTracker';
import TelemetryReporter from 'vscode-extension-telemetry';

export class BrowserPreview extends Disposable {
	public static readonly viewType = 'browserPreview';
	private readonly _pageHistory: PageHistory;

	private currentAddress: string;
	private readonly _onDisposeEmitter = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onDispose = this._onDisposeEmitter.event;

	public close(): void {
		this._panel.dispose();
	}

	public reveal(column: number, file = '/'): void {
		this.goToFile(file);
		this.handleNewPageLoad(file);
		this._panel.reveal(column);
	}

	public updatePortNums(port: number, wsPort: number): void {
		this._port = port;
		this._wsPort = wsPort;
		this.reloadWebview();
	}

	constructor(
		private readonly _panel: vscode.WebviewPanel,
		private readonly _extensionUri: vscode.Uri,
		private _port: number,
		private _wsPort: number,
		initialFile: string,
		private readonly _reporter: TelemetryReporter | undefined
	) {
		super();

		this._panel.iconPath = {
			light: vscode.Uri.joinPath(
				this._extensionUri,
				'media',
				'preview-light.svg'
			),
			dark: vscode.Uri.joinPath(
				this._extensionUri,
				'media',
				'preview-dark.svg'
			),
		};
		this._pageHistory = this._register(new PageHistory());

		this.updateForwardBackArrows();

		// Set the webview's html content
		this.goToFile(initialFile);
		this._pageHistory?.addHistory(initialFile);
		this.currentAddress = initialFile;

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
					case 'update-path': {
						const msgJSON = JSON.parse(message.text);
						this.handleNewPageLoad(msgJSON.pathname, msgJSON.title);
						return;
					}
					case 'go-back':
						this.goBack();
						return;
					case 'go-forward':
						this.goForwards();
						return;
					case 'open-browser':
						this.handleOpenBrowser(message.text);
						return;
					case 'add-history': {
						this._panel.webview.postMessage({
							command: 'set-url',
							text: JSON.stringify({
								fullPath: this.constructAddress(message.text),
								pathname: message.text,
							}),
						});
						// called from main.js in the case where the target is non-injectable
						this.handleNewPageLoad(message.text);
						return;
					}
					case 'refresh-back-forward-buttons':
						this.updateForwardBackArrows();
						return;
					case 'go-to-file':
						this.goToFullAddress(message.text);
						return;
				}
			})
		);
	}

	dispose() {
		this._onDisposeEmitter.fire();
		super.dispose();
	}

	private get _host() {
		return `http://${HOST}:${this._port}`;
	}

	private goToFullAddress(address: string) {
		if (address.startsWith(this._host)) {
			const file = address.substr(this._host.length);
			this.goToFile(file);
			this.handleNewPageLoad(file);
		} else {
			this.handleOpenBrowser(address);
		}
	}

	private reloadWebview() {
		this.goToFile(this.currentAddress);
	}

	private handleOpenBrowser(givenURL: string) {
		const urlString =
			givenURL == '' ? this.constructAddress(this.currentAddress) : givenURL;
		const uri = vscode.Uri.parse(urlString);

		/* __GDPR__
			"preview.openExternalBrowser" : {"classification": "SystemMetaData", "purpose": "FeatureInsight"}
		*/
		this._reporter?.sendTelemetryEvent('preview.openExternalBrowser');
		vscode.window
			.showInformationMessage(
				`Externally hosted links are not supported in the embedded preview. Do you want to open ${urlString} in an external browser?`,
				{ modal: true },
				OPEN_EXTERNALLY
			)
			.then((selection: vscode.MessageItem | undefined) => {
				if (selection) {
					if (selection === OPEN_EXTERNALLY) {
						vscode.env.openExternal(uri);
					}
				}
			});

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

				<title>${INIT_PANEL_TITLE}</title>
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

								
							<input id="url-input" class="url-input" type="text">
							<button
								id="browserOpen"
								title="Open in browser"
								class="open-external-button icon"><i class="codicon codicon-link-external"></i></button>
						</nav>
					</div>
				</div>
				<div class="content">
					<iframe id="hostedContent" src="${url}"></iframe>
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

	private handleNewPageLoad(pathname: string, panelTitle = ''): void {
		// only load relative addresses
		if (pathname.length > 0 && pathname[0] != '/') {
			return;
		}
		this.setPanelTitle(panelTitle, pathname);
		this.currentAddress = pathname;
		const response = this._pageHistory?.addHistory(pathname);
		if (response) {
			for (const i in response.actions) {
				this.handleNavAction(response.actions[i]);
			}
		}
	}

	private goToFile(URLExt: string): void {
		const fullAddr = this.constructAddress(URLExt);
		this.setHtml(this._panel.webview, fullAddr);
		// If we can't rely on inline script to update panel title,
		// then set panel title manually
		if (!isFileInjectable(URLExt)) {
			this.setPanelTitle('', URLExt);
			this._panel.webview.postMessage({
				command: 'set-url',
				text: JSON.stringify({ fullPath: fullAddr, pathname: URLExt }),
			});
		}
		this.currentAddress = URLExt;
	}

	private setPanelTitle(title = '', pathname = 'Preview'): void {
		if (title == '') {
			if (pathname.length > 0 && pathname[0] == '/') {
				if (PathUtil.IsLooseFilePath(pathname)) {
					this._panel.title = PathUtil.GetFileName(pathname);
				} else {
					this._panel.title = pathname.substr(1);
				}
			} else {
				this._panel.title = pathname;
			}
		} else {
			this._panel.title = title;
		}
	}
}
