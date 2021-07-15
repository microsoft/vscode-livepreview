import { OPEN_EXTERNALLY } from '../utils/constants';
import * as vscode from 'vscode';
import { Disposable } from '../utils/dispose';
import { PathUtil } from '../utils/pathUtil';
import TelemetryReporter from 'vscode-extension-telemetry';
import { WorkspaceManager } from '../infoManagers/workspaceManager';
import { ConnectionManager } from '../infoManagers/connectionManager';
import { WebviewComm } from './webviewComm';
import {
	TerminalColor,
	TerminalDeco,
	TerminalStyleUtil,
} from '../utils/terminalStyleUtil';
import { FormatDateTime } from '../utils/utils';

export class BrowserPreview extends Disposable {
	public static readonly viewType = 'browserPreview';
	private readonly _webviewComm: WebviewComm;
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
		this._webviewComm.goToFile(file);
		this._panel.reveal(column);
	}

	constructor(
		initialFile: string,
		private readonly _panel: vscode.WebviewPanel,
		private readonly _extensionUri: vscode.Uri,
		private readonly _reporter: TelemetryReporter,
		private readonly _workspaceManager: WorkspaceManager,
		private readonly _connectionManager: ConnectionManager,
		private readonly _outputChannel: vscode.OutputChannel
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

		this._webviewComm = this._register(
			new WebviewComm(initialFile, _panel, _extensionUri, _connectionManager)
		);

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

		this._register(
			this._webviewComm.onPanelTitleChange((e) => {
				this.setPanelTitle(e.title, e.pathname);
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
						this._webviewComm.handleNewPageLoad(
							msgJSON.path.pathname,
							msgJSON.title
						);
						return;
					}
					case 'go-back':
						this._webviewComm.goBack();
						return;
					case 'go-forward':
						this._webviewComm.goForwards();
						return;
					case 'open-browser':
						this.handleOpenBrowser(message.text);
						return;
					case 'add-history': {
						this._webviewComm.setUrlBar(message.text);
						return;
					}
					case 'refresh-back-forward-buttons':
						this._webviewComm.updateForwardBackArrows();
						return;
					case 'go-to-file':
						this.goToFullAddress(message.text);
						return;

					case 'console': {
						const msgJSON = JSON.parse(message.text);
						this.handleConsole(msgJSON.type, msgJSON.data);
						return;
					}
				}
			})
		);
	}

	private handleConsole(type: string, log: string) {
		if (type == 'CLEAR') {
			this._outputChannel.clear();
		} else {
			const date = new Date();
			this._outputChannel.appendLine(
				`[${type} - ${FormatDateTime(date, ' ')}] ${log}`
			);
		}
	}

	dispose() {
		this._onDisposeEmitter.fire();
		this._panel.dispose();
		super.dispose();
	}

	public get panel() {
		return this._panel;
	}

	private reloadWebview() {
		this._webviewComm.goToFile(this._webviewComm.currentAddress, false);
	}

	private async handleOpenBrowser(givenURL: string) {
		if (givenURL == '') {
			// open at current address, needs task start
			const givenURI = await this._webviewComm.constructAddress(
				this._webviewComm.currentAddress
			);
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
		this._webviewComm.goToFile(this._webviewComm.currentAddress, false);
		this._webviewComm.updateForwardBackArrows();
	}

	public async goToFullAddress(address: string) {
		const host = await this._webviewComm.resolveHost();
		let hostString = host.toString();
		if (hostString.endsWith('/')) {
			hostString = hostString.substr(0, hostString.length - 1);
		}
		if (address.startsWith(hostString)) {
			const file = address.substr(host.toString().length);
			this._webviewComm.goToFile(file);
		} else {
			this.handleOpenBrowser(address);
		}
	}

	private setPanelTitle(title = '', pathname = 'Preview'): void {
		if (title == '') {
			pathname = unescape(pathname);
			if (pathname.length > 0 && pathname[0] == '/') {
				if (
					this._workspaceManager.pathExistsRelativeToDefaultWorkspace(pathname)
				) {
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
