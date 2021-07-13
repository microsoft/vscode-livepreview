import { Disposable } from '../utils/dispose';
import * as vscode from 'vscode';
import { ConnectionManager } from '../infoManagers/connectionManager';
import { INIT_PANEL_TITLE } from '../utils/constants';
import { NavEditCommands, PageHistory } from './pageHistoryTracker';
import { isFileInjectable } from '../utils/utils';

export class WebviewComm extends Disposable {
	private readonly _pageHistory: PageHistory;
	public currentAddress: string;

	private readonly _onPanelTitleChange = this._register(
		new vscode.EventEmitter<{ title?: string; pathname?: string }>()
	);
	public readonly onPanelTitleChange = this._onPanelTitleChange.event;

	constructor(
		initialFile: string,
		private readonly _panel: vscode.WebviewPanel,
		private readonly _extensionUri: vscode.Uri,
		private readonly _connectionManager: ConnectionManager
	) {
		super();

		this._pageHistory = this._register(new PageHistory());
		this.updateForwardBackArrows();

		// Set the webview's html content
		this.goToFile(initialFile, false);
		this._pageHistory?.addHistory(initialFile);
		this.currentAddress = initialFile;
	}

	public async resolveHost() {
		return await this._connectionManager.resolveExternalHTTPUri();
	}

	private async resolveWsHost() {
		return await this._connectionManager.resolveExternalWSUri();
	}

	public async constructAddress(
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

	public async goToFile(URLExt: string, updateHistory = true) {
		this.setHtml(this._panel.webview, URLExt, updateHistory);
		this.currentAddress = URLExt;
	}

	public async setHtml(
		webview: vscode.Webview,
		URLExt: string,
		updateHistory: boolean
	) {
		const httpHost = await this.resolveHost();
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
			this._onPanelTitleChange.fire({ title: '', pathname: URLExt });
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

	public async setUrlBar(pathname: string) {
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

	public handleNavAction(command: NavEditCommands): void {
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

	public handleNewPageLoad(pathname: string, panelTitle = ''): void {
		// only load relative addresses
		if (pathname.length > 0 && pathname[0] != '/') {
			pathname = '/' + pathname;
		}

		this._onPanelTitleChange.fire({ title: panelTitle, pathname: pathname });
		this.currentAddress = pathname;
		const response = this._pageHistory?.addHistory(pathname);
		if (response) {
			for (const i in response.actions) {
				this.handleNavAction(response.actions[i]);
			}
		}
	}

	public updateForwardBackArrows(): void {
		const navigationStatus = this._pageHistory.currentCommands;
		for (const i in navigationStatus) {
			this.handleNavAction(navigationStatus[i]);
		}
	}

	public goForwards(): void {
		const response = this._pageHistory.goForward();

		const pagename = response.address;
		if (pagename != undefined) {
			this.goToFile(pagename, false);
		}

		for (const i in response.actions) {
			this.handleNavAction(response.actions[i]);
		}
	}

	public goBack(): void {
		const response = this._pageHistory.goBackward();

		const pagename = response.address;
		if (pagename != undefined) {
			this.goToFile(pagename, false);
		}

		for (const i in response.actions) {
			this.handleNavAction(response.actions[i]);
		}
	}
}
