/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OPEN_EXTERNALLY } from '../utils/constants';
import * as vscode from 'vscode';
import { Disposable } from '../utils/dispose';
import { PathUtil } from '../utils/pathUtil';
import TelemetryReporter from 'vscode-extension-telemetry';
import { ConnectionManager } from '../connectionInfo/connectionManager';
import { WebviewComm } from './webviewComm';
import { FormatDateTime } from '../utils/utils';
import { SettingUtil } from '../utils/settingsUtil';
import * as path from 'path';
import { URL } from 'url';
import { Connection } from '../connectionInfo/connection';
import { IOpenFileOptions } from '../manager';
import { ExternalBrowserUtils } from '../utils/externalBrowserUtils';

/**
 * Info payload sent from the element picker in injectScript.js.
 */
interface IElementInfo {
	tagName: string;
	id: string | null;
	className: string | null;
	openingTag: string | null;
	ownText: string | null;
	fullText: string | null;
	parentInfo: string | null;
	siblingIndex: number;
	siblingCount: number;
	selector: string;
	href: string;
}

/**
 * @description the embedded preview object, containing the webview panel showing the preview.
 */
export class BrowserPreview extends Disposable {
	public static readonly viewType = 'browserPreview';
	private readonly _webviewComm: WebviewComm;
	private readonly _onDisposeEmitter = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onDispose = this._onDisposeEmitter.event;

	private windowId: number | undefined = undefined;

	private readonly _onShouldLaunchPreview = this._register(
		new vscode.EventEmitter<{
			uri?: vscode.Uri;
			options?: IOpenFileOptions;
			previewType?: string;
		}>()
	);
	public readonly onShouldLaunchPreview = this._onShouldLaunchPreview.event;

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
				this._setPanelTitle(e.title, e.pathname, e.connection);
			})
		);

		// Handle messages from the webview
		this._register(
			this._panel.webview.onDidReceiveMessage((message) =>
				this._handleWebviewMessage(message)
			)
		);
	}

	/**
	 * get the connection that the webview is currently using
	 */
	public get currentConnection(): Connection {
		return this._webviewComm.currentConnection;
	}

	public get currentAddress(): string {
		return this._webviewComm.currentAddress;
	}

	/**
	 * get the webview panel
	 */
	public get panel(): vscode.WebviewPanel {
		return this._panel;
	}

	/**
	 * @description close the embedded browser.
	 */
	public close(): void {
		this._panel.dispose();
	}

	/**
	 * Show the existing embedded preview.
	 * @param column which column to show it in.
	 * @param file the file (pathname) to go to.
	 * @param connection the connection to connect using
	 */
	public async reveal(
		column: number,
		file = '/',
		connection: Connection
	): Promise<void> {
		await this._webviewComm.goToFile(file, true, connection);
		this._panel.reveal(column);
	}

	/**
	 * @description handle messages from the webview (see messages sent from `media/main.js`).
	 * @param {any} message the message from webview
	 */
	private async _handleWebviewMessage(message: any): Promise<void> {
		switch (message.command) {
			case 'alert':
				vscode.window.showErrorMessage(message.text);
				return;
			case 'update-path': {
				const msgJSON = JSON.parse(message.text);
				this._webviewComm.handleNewPageLoad(
					msgJSON.path.pathname,
					this.currentConnection,
					msgJSON.title
				);
				return;
			}
			case 'go-back':
				await this._webviewComm.goBack();
				return;
			case 'go-forward':
				await this._webviewComm.goForwards();
				return;
			case 'open-browser':
				await this._openCurrentAddressInExternalBrowser();
				return;
			case 'add-history': {
				const msgJSON = JSON.parse(message.text);
				const connection = this._connectionManager.getConnectionFromPort(
					msgJSON.port
				);
				await this._webviewComm.setUrlBar(msgJSON.path, connection);
				return;
			}
			case 'refresh-back-forward-buttons':
				this._webviewComm.updateForwardBackArrows();
				return;
			case 'go-to-file':
				await this._goToFullAddress(message.text);
				return;

			case 'console': {
				const msgJSON = JSON.parse(message.text);
				this._handleConsole(msgJSON.type, msgJSON.data);
				return;
			}
			case 'devtools-open':
				vscode.commands.executeCommand(
					'workbench.action.webview.openDeveloperTools'
				);
				return;
			case 'get-window-id':
				this.windowId = message.id;
				if (this.windowId) {
					const currentFullAddress = await this.currentConnection.resolveExternalHTTPUri();
					const url = new URL(this.currentAddress, currentFullAddress.toString(true));
					if (!url.searchParams.has('serverWindowId')) {
						url.searchParams.set('serverWindowId', this.windowId.toString());
						this._webviewComm.currentAddress = url.pathname + url.search;
						this._webviewComm.reloadWebview();
					}
				}
				return;

			// update the inspect button state in the webview
			case 'picker-activated':
				
				this._panel.webview.postMessage({ command: 'picker-activated' });
				return;
			case 'picker-deactivated':
				this._panel.webview.postMessage({ command: 'picker-deactivated' });
				return;
			case 'element-selected': {
				const info: IElementInfo = JSON.parse(message.text);
				await this._goToElementInSource(info);
				return;
			}
		
		}
	}

	/**
	 * @description handle console message that should appear in output channel.
	 * @param {string} type the type of log
	 * @param {string} log the log contents
	 */
	private _handleConsole(type: string, log: string): void {
		if (type == 'CLEAR') {
			this._outputChannel.clear();
		} else {
			const date = new Date();
			this._outputChannel.appendLine(
				`[${type} - ${FormatDateTime(date, ' ')}] ${log}`
			);
		}
	}

	dispose(): void {
		this._onDisposeEmitter.fire();
		this._panel.dispose();
		super.dispose();
	}

	/**
	 * Open in embedded preview's address in external browser
	 */
	private async _openCurrentAddressInExternalBrowser(): Promise<void> {
		const givenURL = await this._webviewComm.constructAddress(
			this._webviewComm.currentAddress, undefined, undefined
		);
		const uri = vscode.Uri.parse(givenURL.toString());

		const previewType = SettingUtil.GetExternalPreviewType();
		this._onShouldLaunchPreview.fire({
			uri: uri,
			options: {
				workspace: this._webviewComm.currentConnection.workspace,
				port: this._webviewComm.currentConnection.httpPort,
			},
			previewType,
		});
	}

	/**
	 * Open in external browser. This also warns the user in the case where the URL is external to the hosted content.
	 * @param {string} givenURL the (full) URL to open up in the external browser.
	 */
	private async _handleOpenBrowser(givenURL: string): Promise<void> {
		vscode.window
			.showInformationMessage(
				vscode.l10n.t(
					'Externally hosted links are not supported in the embedded preview. Do you want to open {0} in an external browser?',
					givenURL
				),
				{ modal: true },
				OPEN_EXTERNALLY
			)
			.then((selection: vscode.MessageItem | undefined) => {
				if (selection) {
					if (selection === OPEN_EXTERNALLY) {
						ExternalBrowserUtils.openInBrowser(givenURL, SettingUtil.GetConfig().customExternalBrowser);
					}
				}
			});
		// navigate back to the previous page, since the page it went to is invalid
		await this._webviewComm.reloadWebview();


		/* __GDPR__
			"preview.openExternalBrowser" : {}
		*/
		this._reporter.sendTelemetryEvent('preview.openExternalBrowser');
	}

	/**
	 * @param {string} address the (full) address to navigate to; will open in external browser if it is an external address.
	 */
	private async _goToFullAddress(address: string): Promise<void> {
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
				hostString = hostString.substring(0, hostString.length - 1);
			}
			const file = address.substring(hostString.length);
			await this._webviewComm.goToFile(file, true, connection);
		} catch (e) {
			await this._handleOpenBrowser(address);
		}
	}

	/**
	 * Set the panel title accordingly, given the title and pathname given
	 * @param {string} title the page title of the page being hosted.
	 * @param {string} pathname the pathname of the path being hosted.
	 */
	private async _setPanelTitle(
		title: string,
		pathname: string,
		connection: Connection
	): Promise<void> {
		if (title == '') {
			pathname = decodeURI(pathname);
			if (pathname.length > 0 && pathname[0] == '/') {
				if (connection.workspace) {
					this._panel.title = await PathUtil.GetFileName(pathname);
				} else {
					this._panel.title = path.basename(pathname.substring(1));
				}
			} else {
				this._panel.title = pathname;
			}
		} else {
			this._panel.title = title;
		}
	}

	// =========================================================================
	// Element Picker — source navigation / This is so helpful
	// =========================================================================

	/**
	 * @description Given element info from the picker, open the source file and
	 *  jump to the best-matching line using a multi-signal scoring system.
	 */
	private async _goToElementInSource(info: IElementInfo): Promise<void> {
		const pathname = decodeURIComponent(info.href);
		const workspace = this._webviewComm.currentConnection.workspace;

		let fileUri: vscode.Uri | undefined;
		if (workspace) {
			const relativePath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
			fileUri = vscode.Uri.joinPath(workspace.uri, relativePath);
		}

		if (!fileUri) {
			vscode.window.showWarningMessage(
				vscode.l10n.t('Live Preview: Could not resolve source file for this element.')
			);
			return;
		}

		try {
			const doc = await vscode.workspace.openTextDocument(fileUri);
			const lines = doc.getText().split('\n');

			const bestLine = this._findBestLine(lines, info);

			const editor = await vscode.window.showTextDocument(doc, {
				viewColumn: vscode.ViewColumn.One,
				preserveFocus: false,
			});

			const pos = new vscode.Position(bestLine, 0);
			editor.selection = new vscode.Selection(pos, pos);
			editor.revealRange(
				new vscode.Range(pos, pos),
				vscode.TextEditorRevealType.InCenter
			);
		} catch {
			vscode.window.showWarningMessage(
				vscode.l10n.t(
					'Live Preview: Could not open source file "{0}".',
					fileUri.fsPath
				)
			);
		}
	}

	/**
	 * @description Score every line of the source file against the element info
	 *  and return the line number with the highest score.
	 *
	 *  Scoring signals (additive):
	 *   +100  line contains id="<id>"
	 *   + 60  line contains class="<className>" (exact first class)
	 *   + 40  line contains all classes from className
	 *   + 30  line contains the full opening tag verbatim
	 *   + 25  line starts a <tag ...> and contains ownText nearby (within 3 lines)
	 *   + 20  neighbouring lines contain parentInfo context
	 *   + 15  siblingIndex matches (element is Nth among same-tag siblings found so far)
	 *   + 10  line contains fullText snippet (≥ 8 chars)
	 */
	private _findBestLine(lines: string[], info: IElementInfo): number {
		const tag = info.tagName;
		const tagOpen = `<${tag}`;

		// Pre-build normalised search tokens
		const firstClass = info.className ? info.className.trim().split(/\s+/)[0] : null;
		const allClasses = info.className ? info.className.trim().split(/\s+/) : [];
		const textSnippet = (info.ownText && info.ownText.length >= 8)
			? info.ownText.slice(0, 60)
			: (info.fullText && info.fullText.length >= 8)
				? info.fullText.slice(0, 60)
				: null;

		// Track how many <tag ...> openings we've seen, for siblingIndex matching
		let tagOccurrence = -1;

		let bestScore = -1;
		let bestLine = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineLower = line.toLowerCase();

			// Only score lines that open our tag
			if (!lineLower.includes(tagOpen)) continue;

			tagOccurrence++;
			let score = 0;

			// Signal: id match (strongest — IDs should be unique)
			if (info.id && line.includes(`id="${info.id}"`)) {
				score += 100;
			}

			// Signal: exact first class match
			if (firstClass && line.includes(`class="${firstClass}"`)) {
				score += 60;
			}

			// Signal: all classes present in line
			if (allClasses.length > 0 && allClasses.every(cls => line.includes(cls))) {
				score += 40;
			}

			// Signal: full opening tag verbatim
			if (info.openingTag && line.includes(info.openingTag.trim())) {
				score += 30;
			}

			// Signal: text content found within ±3 lines
			if (textSnippet) {
				const window = lines
					.slice(Math.max(0, i - 1), Math.min(lines.length, i + 4))
					.join(' ');
				if (window.includes(textSnippet)) {
					score += 25;
				}
			}

			// Signal: parent context found within 5 lines above
			if (info.parentInfo) {
				const above = lines
					.slice(Math.max(0, i - 5), i)
					.join(' ');
				const parentTag = info.parentInfo.split(/[#.]/)[0];
				const parentId = info.parentInfo.includes('#')
					? info.parentInfo.split('#')[1]?.split('.')[0]
					: null;
				const parentClass = info.parentInfo.includes('.')
					? info.parentInfo.split('.')[1]
					: null;
				if (above.toLowerCase().includes(`<${parentTag}`)) {
					score += 10;
					if (parentId && above.includes(`id="${parentId}"`)) score += 10;
					if (parentClass && above.includes(parentClass)) score += 5;
				}
			}

			// Signal: sibling index (which occurrence of <tag> is this?)
			if (info.siblingCount > 1 && tagOccurrence === info.siblingIndex) {
				score += 15;
			}

			if (score > bestScore) {
				bestScore = score;
				bestLine = i;
			}
		}

		return bestLine;
	}
}