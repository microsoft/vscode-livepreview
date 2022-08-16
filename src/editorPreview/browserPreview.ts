import { OPEN_EXTERNALLY } from '../utils/constants';
import * as vscode from 'vscode';
import { Disposable } from '../utils/dispose';
import { PathUtil } from '../utils/pathUtil';
import TelemetryReporter from 'vscode-extension-telemetry';
// import { WorkspaceManager } from '../infoManagers/workspaceManager';
import { ConnectionManager } from '../connectionInfo/connectionManager';
import { WebviewComm } from './webviewComm';
import { FormatDateTime } from '../utils/utils';
import { SETTINGS_SECTION_ID, SettingUtil } from '../utils/settingsUtil';
import * as path from 'path';
import * as nls from 'vscode-nls';
import { decode } from 'querystring';
import { URL } from 'url';
import { Connection } from '../connectionInfo/connection';

const localize = nls.loadMessageBundle();

/**
 * @description the embedded preview object, containing the webview panel showing the preview.
 */
export class BrowserPreview extends Disposable {
	public static readonly viewType = 'browserPreview';
	private readonly _webviewComm: WebviewComm;
	// private currentConne
	private readonly _onDisposeEmitter = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onDispose = this._onDisposeEmitter.event;

	/**
	 * @description close the embedded browser.
	 */

	public get currentConnection() {
		return this._webviewComm.currentConnection;
	}

	public close(): void {
		this._panel.dispose();
	}

	/**
	 * Show the existing embedded preview.
	 * @param column which column to show it in.
	 * @param file the file (pathname) to go to.
	 */
	public reveal(column: number, file = '/'): void {
		this._webviewComm.goToFile(file);
		this._panel.reveal(column);
	}

	constructor(
		initialFile: string,
		initialConnection: Connection,
		private readonly _panel: vscode.WebviewPanel,
		private readonly _extensionUri: vscode.Uri,
		private readonly _reporter: TelemetryReporter,
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
			new WebviewComm(
				initialFile,
				initialConnection,
				_panel,
				_extensionUri,
				_connectionManager
			)
		);

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._register(
			this._panel.onDidDispose(() => {
				this.dispose();
			})
		);

		this._register(
			this._webviewComm.onPanelTitleChange((e) => {
				this.setPanelTitle(e.title, e.pathname);
			})
		);

		// Handle messages from the webview
		this._register(
			this._panel.webview.onDidReceiveMessage((message) =>
				this.handleWebviewMessage(message)
			)
		);
	}

	/**
	 * @description handle messages from the webview (see messages sent from `media/main.js`).
	 * @param {any} message the message from webview
	 */
	private handleWebviewMessage(message: any): void {
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
				const connection = this._connectionManager.getConnectionFromPort(
					message.port
				);
				this._webviewComm.setUrlBar(message.text, connection);
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
			case 'devtools-open':
				vscode.commands.executeCommand(
					'workbench.action.webview.openDeveloperTools'
				);
				return;
		}
	}

	/**
	 * @description handle console message that should appear in output channel.
	 * @param {string} type the type of log
	 * @param {string} log the log contents
	 */
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

	public get panel(): vscode.WebviewPanel {
		return this._panel;
	}

	/**
	 * Open in external browser. This also warns the user in the case where the URL is external to the hosted content.
	 * @param {string} givenURL the (full) URL to open up in the external browser.
	 */
	private async handleOpenBrowser(givenURL: string) {
		if (givenURL == '') {
			// open at current address, needs task start
			const givenURI = await this._webviewComm.constructAddress(
				this._webviewComm.currentAddress
			);
			const uri = vscode.Uri.parse(givenURI.toString());
			vscode.commands.executeCommand(
				`${SETTINGS_SECTION_ID}.start.${SettingUtil.GetExternalPreviewType(
					this._extensionUri
				)}.atFile`,
				uri,
				false
			);
		} else {
			const uri = vscode.Uri.parse(givenURL);
			vscode.window
				.showInformationMessage(
					localize(
						'unsupportedLink',
						'Externally hosted links are not supported in the embedded preview. Do you want to open {0} in an external browser?',
						givenURL
					),
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

	/**
	 * @param {string} address the (full) address to navigate to; will open in external browser if it is an external address.
	 */
	public async goToFullAddress(address: string) {
		try {
			const port = new URL(address).port;
			if (port === undefined) {
				throw Error;
			}
			const connection = this._connectionManager.getConnectionFromPort(
				parseInt(port)
			);

			if (!connection) {
				throw Error;
			}

			const host = await this._webviewComm.resolveHost(connection);
			let hostString = host.toString();
			if (hostString.endsWith('/')) {
				hostString = hostString.substr(0, hostString.length - 1);
			}
			const file = address.substr(host.toString().length);
			this._webviewComm.goToFile(file, connection);
		} catch (e) {
			this.handleOpenBrowser(address);
		}
	}

	/**
	 * Set the panel title accordingly, given the title and pathname given
	 * @param {string} title the page title of the page being hosted.
	 * @param {string} pathname the pathname of the path being hosted.
	 */
	private setPanelTitle(title = '', pathname = 'Preview'): void {
		if (title == '') {
			pathname = unescape(pathname);
			if (pathname.length > 0 && pathname[0] == '/') {
				if (PathUtil.PathExistsRelativeToAnyWorkspace(pathname)) {
					this._panel.title = PathUtil.GetFileName(pathname);
				} else {
					this._panel.title = path.basename(pathname.substr(1));
				}
			} else {
				this._panel.title = pathname;
			}
		} else {
			this._panel.title = title;
		}
	}
}
