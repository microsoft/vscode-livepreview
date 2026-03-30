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
 * sourceLine is the 1-based line number injected by SourceAnnotator at serve time.
 * When present it provides a deterministic, zero-ambiguity source location.
 * The remaining fields are fallbacks for JS-injected nodes that lack the annotation.
 */
interface IElementInfo {
	sourceLine: number | null;
	tagName: string;
	id: string | null;
	className: string | null;
	fullText: string | null;
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

			// ── Element Picker ────────────────────────────────────────────
			case 'element-selected': {
				const info: IElementInfo = JSON.parse(message.text);
				await this._goToElementInSource(info);
				return;
			}
			case 'navigate-match': {
				const dir = message.text as 'next' | 'prev';
				await this._navigateMatch(dir);
				return;
			}
			// ─────────────────────────────────────────────────────────────
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
	// Element Picker — source navigation
	// =========================================================================

	/** Decoration type used to highlight the selected line. */
	private readonly _matchDecoration = vscode.window.createTextEditorDecorationType({
		backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
		isWholeLine: true,
	});

	/**
	 * @description Given element info from the picker, open the source file.
	 * If there is only one match, jump to it directly.
	 * If there are multiple similar matches, send them all to the webview
	 * so the user can navigate with ‹ › arrows.
	 */
	/**
	 * @description Given element info from the picker, jump directly to the source line.
	 *
	 * Primary path: use info.sourceLine (injected by SourceAnnotator) — deterministic,
	 * zero ambiguity, works for every element including identical siblings.
	 *
	 * Fallback path: if sourceLine is null (JS-injected node), fall back to
	 * text/id-based search with navigation arrows for ambiguous cases.
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

			// ── Primary path: sourceLine from data-lp-line attribute ──────────
			if (info.sourceLine !== null) {
				// sourceLine is 1-based; VS Code Position is 0-based
				const lineNumber = info.sourceLine - 1;

				// Notify webview: single match, hide nav bar
				this._panel.webview.postMessage({
					command: 'match-results',
					text: JSON.stringify({ current: 1, total: 1 }),
				});

				const editor = await vscode.window.showTextDocument(doc, {
					viewColumn: vscode.ViewColumn.One,
					preserveFocus: true,
				});

				const pos = new vscode.Position(lineNumber, 0);
				editor.selection = new vscode.Selection(pos, pos);
				editor.revealRange(
					new vscode.Range(pos, pos),
					vscode.TextEditorRevealType.InCenter
				);
				const lineRange = editor.document.lineAt(lineNumber).range;
				editor.setDecorations(this._matchDecoration, [lineRange]);
				return;
			}

			// ── Fallback path: text/id search for JS-injected nodes ───────────
			const lines = doc.getText().split('');
			const candidates = this._findFallbackMatches(lines, info);

			if (candidates.length === 0) {
				vscode.window.showWarningMessage(
					vscode.l10n.t('Live Preview: Could not locate element in source.')
				);
				return;
			}

			this._fallbackMatches = candidates;
			this._fallbackIndex = 0;
			this._fallbackFileUri = fileUri;

			this._panel.webview.postMessage({
				command: 'match-results',
				text: JSON.stringify({ current: 1, total: candidates.length }),
			});

			const editor = await vscode.window.showTextDocument(doc, {
				viewColumn: vscode.ViewColumn.One,
				preserveFocus: true,
			});
			this._revealFallback(editor, 0);
		} catch {
			vscode.window.showWarningMessage(
				vscode.l10n.t(
					'Live Preview: Could not open source file "{0}".',
					fileUri.fsPath
				)
			);
		}
	}

	// Fallback state for JS-injected nodes that lack data-lp-line
	private _fallbackMatches: number[] = [];
	private _fallbackIndex = 0;
	private _fallbackFileUri: vscode.Uri | undefined;

	/**
	 * @description Navigate to the next or previous fallback match.
	 */
	private async _navigateMatch(direction: 'next' | 'prev'): Promise<void> {
		if (this._fallbackMatches.length === 0 || !this._fallbackFileUri) { return; }

		if (direction === 'next') {
			this._fallbackIndex = (this._fallbackIndex + 1) % this._fallbackMatches.length;
		} else {
			this._fallbackIndex = (this._fallbackIndex - 1 + this._fallbackMatches.length) % this._fallbackMatches.length;
		}

		try {
			const doc = await vscode.workspace.openTextDocument(this._fallbackFileUri);
			const editor = await vscode.window.showTextDocument(doc, {
				viewColumn: vscode.ViewColumn.One,
				preserveFocus: true,
			});
			this._revealFallback(editor, this._fallbackIndex);
			this._panel.webview.postMessage({
				command: 'match-results',
				text: JSON.stringify({
					current: this._fallbackIndex + 1,
					total: this._fallbackMatches.length,
				}),
			});
		} catch {
			// noop
		}
	}

	/**
	 * @description Highlight and scroll to a specific fallback match by index.
	 */
	private _revealFallback(editor: vscode.TextEditor, index: number): void {
		const lineNumber = this._fallbackMatches[index];
		const pos = new vscode.Position(lineNumber, 0);
		editor.selection = new vscode.Selection(pos, pos);
		editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
		editor.setDecorations(this._matchDecoration, [editor.document.lineAt(lineNumber).range]);
	}

	/**
	 * @description Fallback element search for nodes that lack data-lp-line.
	 * Uses ID (exact), then text content, then class matching.
	 * Returns all candidate line numbers sorted best-first.
	 */
	private _findFallbackMatches(lines: string[], info: IElementInfo): number[] {
		const tagOpen = `<${info.tagName}`;

		// ID — unique
		if (info.id) {
			const idx = lines.findIndex(l => l.includes(`id="${info.id}"`));
			if (idx !== -1) { return [idx]; }
		}

		const textSnippet = info.fullText && info.fullText.length >= 4
			? info.fullText.slice(0, 80)
			: null;

		const scored: Array<{ line: number; score: number }> = [];

		for (let i = 0; i < lines.length; i++) {
			if (!lines[i].toLowerCase().includes(tagOpen)) { continue; }
			let score = 0;

			if (textSnippet) {
				const ctx = lines.slice(i, Math.min(lines.length, i + 4)).join(' ');
				if (ctx.includes(textSnippet)) { score += 60; }
			}

			if (info.className) {
				const allClasses = info.className.trim().split(/\s+/);
				if (allClasses.every(cls => lines[i].includes(cls))) { score += 40; }
			}

			if (score > 0) { scored.push({ line: i, score }); }
		}

		if (scored.length === 0) { return []; }
		scored.sort((a, b) => b.score - a.score);
		const best = scored[0].score;

		if (scored.length === 1 || best > (scored[1]?.score ?? 0) * 1.4) {
			return [scored[0].line];
		}

		return scored.filter(s => s.score >= best * 0.5).map(s => s.line);
	}
}