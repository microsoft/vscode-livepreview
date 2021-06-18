import { relative } from 'path';
import { URL } from 'url';
import * as vscode from 'vscode';
import { BrowserPreview } from './editorPreview/browserPreview';
import { getWebviewOptions, Manager } from './manager';
import { HOST } from './utils/constants';
import { GetPreviewType, SETTINGS_SECTION_ID } from './utils/settingsUtil';
import {
	GetRelativeActiveFile,
	GetRelativeFile,
} from './utils/utils';

export function activate(context: vscode.ExtensionContext) {
	const manager = new Manager(context.extensionUri);

	context.subscriptions.push(
		vscode.commands.registerCommand(`${SETTINGS_SECTION_ID}.start`, () => {
			manager.openServer(true);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.preview.atFile`,
			(file?: any) => {
				const previewType = GetPreviewType(context.extensionUri);
				vscode.commands.executeCommand(
					`${SETTINGS_SECTION_ID}.start.${previewType}.atFile`,
					file
				);
			}
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.preview.atIndex`,
			(file?: any) => {
				const previewType = GetPreviewType(context.extensionUri);
				vscode.commands.executeCommand(
					`${SETTINGS_SECTION_ID}.start.${previewType}.atIndex`,
					file
				);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.externalpreview.atIndex`,
			() => {
				manager.showPreviewInBrowser();
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.internalPreview.atIndex`,
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
				} else if (typeof file == 'string') {
					relativeFile = file;
				} else {
					relativeFile = GetRelativeActiveFile();
				}

				
				if (relativeFile == '') {
					vscode.window.showErrorMessage("This file is not a part of the workspace where the server has started. Cannot preview.");
					return;
				}
				
				manager.showPreviewInBrowser(relativeFile);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.internalPreview.atFile`,
			(file?: any) => {
				let relativeFile;
				if (file instanceof vscode.Uri) {
					relativeFile = GetRelativeFile(file?.fsPath);
				} else if (typeof file == 'string') {
					relativeFile = file;
				} else {
					relativeFile = GetRelativeActiveFile();
				}

				if (relativeFile == '') {
					vscode.window.showErrorMessage("This file is not a part of the workspace where the server has started. Cannot preview.");
					return;
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
		provideTerminalLinks: (
			context: vscode.TerminalLinkContext,
			token: vscode.CancellationToken
		) => {
			const links = new Array<vscode.TerminalLink>();
			if (
				!context.terminal.creationOptions.name ||
				!manager.isPtyTerm(context.terminal.creationOptions.name)
			) {
				return links;
			}

			findFullLinkRegex(context.line, links);
			findPathnameRegex(context.line, links);
			return links;
		},
		handleTerminalLink: (link: any) => {
			vscode.commands.executeCommand(
				'LiveServer.start.preview.atFile',
				link.data
			);
		},
	});
}
export function findFullLinkRegex(
	input: string,
	links: Array<vscode.TerminalLink>
) {
	const fullLinkRegex = new RegExp(
		`\\b\\w{2,20}:\\/\\/(?:localhost|${HOST}|:\\d{2,5})[\\w\\-.~:/?#[\\]@!$&()*+,;=]*`,
		'g'
	);

	let fullURLMatches;
	do {
		fullURLMatches = fullLinkRegex.exec(input);
		if (fullURLMatches) {
			for (let i = 0; i < fullURLMatches.length; i++) {
				if (fullURLMatches[i]) {
					const url = new URL(fullURLMatches[i]);
					const tl = {
						startIndex: fullURLMatches.index,
						length: fullURLMatches[i].length,
						tooltip: `Open in Preview `,
						data: url.pathname + url.search,
					};
					links.push(tl);
				}
			}
		}
	} while (fullURLMatches);
}

export function findPathnameRegex(
	input: string,
	links: Array<vscode.TerminalLink>
) {
	// match relative links
	const partialLinkRegex = new RegExp(`(?<=\\s)\\/([/\\w.]*)\\?*[\\w=]*`, 'g');
	let partialLinkMatches;
	do {
		partialLinkMatches = partialLinkRegex.exec(input);
		if (partialLinkMatches) {
			for (let i = 0; i < partialLinkMatches.length; i++) {
				if (partialLinkMatches[i]) {
					const tl = {
						startIndex: partialLinkMatches.index,
						length: partialLinkMatches[i].length,
						tooltip: `Open in Preview `,
						data: partialLinkMatches[i],
					};
					links.push(tl);
				}
			}
		}
	} while (partialLinkMatches);
}
