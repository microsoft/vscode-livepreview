import * as vscode from 'vscode';
import { INIT_PANEL_TITLE, OPEN_EXTERNALLY } from '../utils/constants';
import { Disposable } from '../utils/dispose';
import { isFileInjectable } from '../utils/utils';
import { PathUtil } from '../utils/pathUtil';
import { PageHistory, NavEditCommands } from './pageHistoryTracker';
import TelemetryReporter from 'vscode-extension-telemetry';
import { WorkspaceManager } from '../infoManagers/workspaceManager';
import { EndpointManager } from '../infoManagers/endpointManager';
import { ConnectionManager } from '../infoManagers/connectionManager';

export class BrowserPreview extends Disposable {
	public static readonly viewType = 'browserPreview';
	private readonly _pageHistory: PageHistory;

	private currentAddress: string;
	private readonly _onDisposeEmitter = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onDispose = this._onDisposeEmitter.event;

	private readonly _onShiftToExternalBrowser = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onShiftToExternalBrowser =
		this._onShiftToExternalBrowser.event;

	public close(): void {
		this._panel.dispose();
	}

	public reveal(column: number, file = '/'): void {
		this.goToFile(file);
		this._panel.reveal(column);
	}

	private get _port() {
		return this._connectionManager.httpPort;
	}

	private get _wsPort() {
		return this._connectionManager.wsPort;
	}

	constructor(
		private readonly _panel: vscode.WebviewPanel,
		private readonly _extensionUri: vscode.Uri,
		initialFile: string,
		private readonly _reporter: TelemetryReporter,
		private readonly _workspaceManager: WorkspaceManager,
		private readonly _endpointManager: EndpointManager,
		private readonly _connectionManager: ConnectionManager
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
		this.goToFile(initialFile, false);
		this._pageHistory?.addHistory(initialFile);
		this.currentAddress = initialFile;

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._register(
			this._panel.onDidDispose(() => {
				this.dispose();
			})
		);

		this._register(
			this._connectionManager.onConnected((e) => {
				this.reloadWebview();
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
						this.handleNewPageLoad(msgJSON.path.pathname, msgJSON.title);
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
						this.setUrlBar(message.text);
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

	private async setUrlBar(pathname: string) {
		this._panel.webview.postMessage({
			command: 'set-url',
			text: JSON.stringify({
				fullPath: await this.constructAddress(pathname),
				pathname: pathname,
			}),
		});
		// called from main.js in the case where the target is non-injectable
		this.handleNewPageLoad(pathname);
	}

	public get panel() {
		return this._panel;
	}

	private async resolveHost() {
		return await this._connectionManager.resolveExternalHTTPUri();
	}

	private async resolveWsHost() {
		return await this._connectionManager.resolveExternalWSUri();
	}

	private async goToFullAddress(address: string) {
		const host = await this.resolveHost();
		let hostString = host.toString();
		if (hostString.endsWith('/')) {
			hostString = hostString.substr(0, hostString.length - 1);
		}
		if (address.startsWith(hostString)) {
			const file = address.substr(host.toString().length);
			this.goToFile(file);
		} else {
			this.handleOpenBrowser(address);
		}
	}

	private reloadWebview() {
		this.goToFile(this.currentAddress, false);
	}

	private async handleOpenBrowser(givenURL: string) {
		if (givenURL == '') {
			// open at current address, needs task start
			const givenURI = await this.constructAddress(this.currentAddress);
			const uri = vscode.Uri.parse(givenURI.toString());
			// tells manager that it can launch browser immediately
			// task will run in case browser preview is closed.
			this._onShiftToExternalBrowser.fire();
			vscode.env.openExternal(uri);
		} else {
			const uri = vscode.Uri.parse(givenURL);
			vscode.window
				.showInformationMessage(
					`Externally hosted links are not supported in the embedded preview. Do you want to open ${givenURL} in an external browser?`,
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
		}

		/* __GDPR__
			"preview.openExternalBrowser" : {}
		*/
		this._reporter.sendTelemetryEvent('preview.openExternalBrowser');
		this.goToFile(this.currentAddress, false);
		this.updateForwardBackArrows();
	}

	private updateForwardBackArrows(): void {
		const navigationStatus = this._pageHistory.currentCommands;
		for (const i in navigationStatus) {
			this.handleNavAction(navigationStatus[i]);
		}
	}

	private async constructAddress(
		URLExt: string,
		hostURI?: vscode.Uri
	): Promise<string> {
		if (URLExt.length > 0 && URLExt[0] == '/') {
			URLExt = URLExt.substring(1);
		}
		URLExt = URLExt.replace('\\', '/');
		URLExt = URLExt.startsWith('/') ? URLExt.substr(1) : URLExt;

		if (!hostURI) {
			hostURI = await this.resolveHost();
		}
		return `${hostURI.toString()}${URLExt}`;
	}

	private async setHtml(
		webview: vscode.Webview,
		URLExt: string,
		httpHost: vscode.Uri,
		updateHistory: boolean
	) {
		const url = await this.constructAddress(URLExt, httpHost);
		const wsURI = await this.resolveWsHost();
		this._panel.webview.html = this.getHtmlForWebview(
			webview,
			url,
			`ws://${wsURI.authority}`,
			`${httpHost.scheme}://${httpHost.authority}`
		);

		// If we can't rely on inline script to update panel title,
		// then set panel title manually
		if (!isFileInjectable(URLExt)) {
			this.setPanelTitle('', URLExt);
			this._panel.webview.postMessage({
				command: 'set-url',
				text: JSON.stringify({ fullPath: url, pathname: URLExt }),
			});
		}
		if (updateHistory) {
			this.handleNewPageLoad(URLExt);
		}
	}

	private getHtmlForWebview(
		webview: vscode.Webview,
		httpURL: string,
		wsURL: string,
		httpHost: string
	): string {
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
				frame-src ${httpHost};
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
							<input 
								id="url-input"
								class="url-input" 
								type="text">
							<button
								id="browserOpen"
								title="Open in browser"
								class="open-external-button icon"><i class="codicon codicon-link-external"></i></button>
						</nav>
					</div>
				</div>
				<div class="content">
					<iframe id="hostedContent" src="${httpURL}"></iframe>
				</div>
				
			</div>
			<div id="link-preview"></div>
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
			this.goToFile(pagename, false);
		}

		for (const i in response.actions) {
			this.handleNavAction(response.actions[i]);
		}
	}

	private goBack(): void {
		const response = this._pageHistory.goBackward();

		const pagename = response.address;
		if (pagename != undefined) {
			this.goToFile(pagename, false);
		}

		for (const i in response.actions) {
			this.handleNavAction(response.actions[i]);
		}
	}

	private handleNavAction(command: NavEditCommands): void {
		let text = {};
		switch (command) {
			case NavEditCommands.DISABLE_BACK:
				text = { element: 'back', disabled: true };
				break;
			case NavEditCommands.ENABLE_BACK:
				text = { element: 'back', disabled: false };
				break;
			case NavEditCommands.DISABLE_FORWARD:
				text = { element: 'forward', disabled: true };
				break;
			case NavEditCommands.ENABLE_FORWARD:
				text = { element: 'forward', disabled: false };
				break;
		}

		this._panel.webview.postMessage({
			command: 'changed-history',
			text: JSON.stringify(text),
		});
	}

	private handleNewPageLoad(pathname: string, panelTitle = ''): void {
		// only load relative addresses
		if (pathname.length > 0 && pathname[0] != '/') {
			pathname = '/' + pathname;
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

	private async goToFile(URLExt: string, updateHistory = true) {
		const httpHost = await this.resolveHost();
		this.setHtml(this._panel.webview, URLExt, httpHost, updateHistory);
		this.currentAddress = URLExt;
	}

	private setPanelTitle(title = '', pathname = 'Preview'): void {
		if (title == '') {
			pathname = unescape(pathname);
			if (pathname.length > 0 && pathname[0] == '/') {
				if (this._workspaceManager.isLooseFilePath(pathname)) {
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
