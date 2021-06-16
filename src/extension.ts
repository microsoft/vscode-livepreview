import { URL } from 'url';
import * as vscode from 'vscode';
import { BrowserPreview } from './editorPreview/browserPreview';
import { getWebviewOptions, Manager } from './manager';
import { HOST, SETTINGS_SECTION_ID } from './utils/constants';
import { GetRelativeActiveFile, GetRelativeFile } from './utils/utils';

export function activate(context: vscode.ExtensionContext) {
	const manager = new Manager(context.extensionUri);

	context.subscriptions.push(
		vscode.commands.registerCommand(`${SETTINGS_SECTION_ID}.start`, () => {
			manager.openServer(true);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.preview.atIndex`,
			() => {
				manager.createOrShowPreview();
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.externalPreview.atFile`,
			(file?: any) => {
				let relativeFile;
				if (file instanceof vscode.Uri) {
					relativeFile = GetRelativeFile(file?.fsPath);
				} else if (typeof(file) ==  'string') {
					relativeFile = file;
				} else {
					relativeFile = GetRelativeActiveFile();
				}
				manager.showPreviewInBrowser(relativeFile);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.preview.atFile`,
			(file?: any) => {
				let relativeFile;
				if (file instanceof vscode.Uri) {
					relativeFile = GetRelativeFile(file?.fsPath);
				} else if (typeof(file) ==  'string') {
					relativeFile = file;
				} else {
					relativeFile = GetRelativeActiveFile();
				}
				manager.createOrShowPreview(undefined, relativeFile);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(`${SETTINGS_SECTION_ID}.end`, () => {
			manager.closeServer();
		})
	);


	if (vscode.window.registerWebviewPanelSerializer) {
		vscode.window.registerWebviewPanelSerializer(BrowserPreview.viewType, {
			async deserializeWebviewPanel(
				webviewPanel: vscode.WebviewPanel,
				state: any
			) {
				const file = state.currentAddress ?? '/';
				// Reset the webview options so we use latest uri for `localResourceRoots`.
				webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
				manager.createOrShowPreview(webviewPanel, file);
			},
		});
	}

	vscode.window.registerTerminalLinkProvider({
		provideTerminalLinks: (context: vscode.TerminalLinkContext, token: vscode.CancellationToken) => {
			// TODO: check terminal to try to only run on pty
			const linkRegex = new RegExp(`\\b\\w{2,20}:\\/\\/(?:localhost|${HOST}|:\\d{2,5})[\\w\\-.~:/?#[\\]@!$&()*+,;=]*`,'g');

			const ret = new Array<vscode.TerminalLink>();
	
			let m;
			do { 
				m = linkRegex.exec(context.line);
				if (m) {
					for (let i = 0; i < m.length; i++) {
						if (m[i]) {
								const url = new URL(m[i]);

								const tl = {startIndex: m.index, length: m[i].length, tooltip: `Open in Preview `, data:url.pathname + url.search};
								ret.push(tl);
							}
						}
					}
			} while (m);
	
			return ret;
		},
		handleTerminalLink: (link: any) => {
			vscode.commands.executeCommand("LiveServer.start.preview.atFile",link.data);

		}
	});
}
