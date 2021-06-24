import * as vscode from 'vscode';
import * as fs from 'fs';
import TelemetryReporter from 'vscode-extension-telemetry';
import { URL } from 'url';
import { BrowserPreview } from './editorPreview/browserPreview';
import { getWebviewOptions, Manager } from './manager';
import { EXTENSION_ID, HOST } from './utils/constants';
import { SETTINGS_SECTION_ID, SettingUtil } from './utils/settingsUtil';
import { PathUtil } from './utils/pathUtil';
import { GetActiveFile } from './utils/utils';

let reporter: TelemetryReporter;

export function activate(context: vscode.ExtensionContext) {
	const extPackageJSON = context.extension.packageJSON;

	reporter = new TelemetryReporter(
		EXTENSION_ID,
		extPackageJSON.version,
		extPackageJSON.aiKey
	);
	context.subscriptions.push(reporter);

	const manager = new Manager(context.extensionUri, reporter);
	/* __GDPR__
		"extension.startUp" : { 
			"numWorkspaceFolders" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", isMeasurement: true }
		}
	*/
	reporter.sendTelemetryEvent(
		'extension.startUp',
		{},
		{ numWorkspaceFolders: vscode.workspace.workspaceFolders?.length ?? 0 }
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.preview.atFile`,
			(file?: any) => {
				const previewType = SettingUtil.GetPreviewType(context.extensionUri);
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
				const previewType = SettingUtil.GetPreviewType(context.extensionUri);
				vscode.commands.executeCommand(
					`${SETTINGS_SECTION_ID}.start.${previewType}.atIndex`,
					file
				);
			}
		)
	);

	const openPreview = (
		internal: boolean,
		file: string,
		isRelative: boolean
	) => {
		if (internal) {
			manager.createOrShowPreview(undefined, file, isRelative);
		} else {
			manager.showPreviewInBrowser(file, false);
		}
	};

	const handleOpenFile = (internal: boolean, file: any) => {
		if (typeof file == 'string') {
			openPreview(internal, file, true);
			return;
		} else if (file instanceof vscode.Uri) {
			const filePath = file?.fsPath;
			if (filePath) {
				openPreview(internal, filePath, false);
				return;
			} else {
				const activeFilePath = GetActiveFile();
				if (activeFilePath) {
					openPreview(internal, activeFilePath, false);
					return;
				}
			}
		} else {
			const activeFilePath = GetActiveFile();
			if (activeFilePath) {
				openPreview(internal, activeFilePath, false);
				return;
			}
		}

		vscode.window.showErrorMessage(
			'This file is not a part of the workspace where the server has started. Cannot preview.'
		);
		return;
	};

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.externalpreview.atIndex`,
			() => {
				/* __GDPR__
					"preview" :{
						"type" : {"classification": "SystemMetaData", "purpose": "FeatureInsight"},
						"location" : {"classification": "SystemMetaData", "purpose": "FeatureInsight"}
					}
				*/
				reporter.sendTelemetryEvent('preview', {
					type: 'external',
					location: 'atIndex',
				});
				manager.showPreviewInBrowser();
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.internalPreview.atIndex`,
			() => {
				/* __GDPR__
					"preview" :{
						"type" : {"classification": "SystemMetaData", "purpose": "FeatureInsight"},
						"location" : {"classification": "SystemMetaData", "purpose": "FeatureInsight"}
					}
				*/
				reporter.sendTelemetryEvent('preview', {
					type: 'internal',
					location: 'atIndex',
				});
				manager.createOrShowPreview();
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.externalPreview.atFile`,
			(file?: any) => {
				/* __GDPR__
					"preview" :{
						"type" : {"classification": "SystemMetaData", "purpose": "FeatureInsight"},
						"location" : {"classification": "SystemMetaData", "purpose": "FeatureInsight"}
					}
				*/
				reporter.sendTelemetryEvent('preview', {
					type: 'external',
					location: 'atFile',
				});
				handleOpenFile(false, file);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.internalPreview.atFile`,
			(file?: any) => {
				/* __GDPR__
					"preview" :{
						"type" : {"classification": "SystemMetaData", "purpose": "FeatureInsight"},
						"location" : {"classification": "SystemMetaData", "purpose": "FeatureInsight"}
					}
				*/
				reporter.sendTelemetryEvent('preview', {
					type: 'internal',
					location: 'atFile',
				});
				handleOpenFile(true, file);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(`${SETTINGS_SECTION_ID}.end`, () => {
			if (!manager.closeServer()) {
				/* __GDPR__
					"server.forceClose" : {}
				*/
				reporter.sendTelemetryEvent('server.forceClose');
				vscode.window.showErrorMessage('Server already off.');
			}
		})
	);

	if (vscode.window.registerWebviewPanelSerializer) {
		vscode.window.registerWebviewPanelSerializer(BrowserPreview.viewType, {
			async deserializeWebviewPanel(
				webviewPanel: vscode.WebviewPanel,
				state: any
			) {
				let file = state.currentAddress ?? '/';

				if (!PathUtil.PathExistsRelativeToWorkspace(file)) {
					file = '/';
				}
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
			/* __GDPR__
				"task.terminal.handleTerminalLink" : {}
			*/
			reporter.sendTelemetryEvent('task.terminal.handleTerminalLink');
			if (link.inEditor) {
				openRelativeLinkInWorkspace(link.data, link.isDir, manager);
			} else {
				vscode.commands.executeCommand(
					'LiveServer.start.preview.atFile',
					link.data
				);
			}
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
						inEditor: false,
					};
					links.push(tl);
				}
			}
		}
	} while (fullURLMatches);
}

export function deactivate(): void {
	reporter.dispose();
}

export function findPathnameRegex(
	input: string,
	links: Array<vscode.TerminalLink>
) {
	// match relative links
	const partialLinkRegex = new RegExp(
		`(?<=\\s)\\/([/(\\w%\\-.)]*)\\?*[\\w=]*`,
		'g'
	);
	let partialLinkMatches;
	do {
		partialLinkMatches = partialLinkRegex.exec(input);
		if (partialLinkMatches) {
			for (let i = 0; i < partialLinkMatches.length; i++) {
				if (partialLinkMatches[i]) {
					const link = partialLinkMatches[i];
					const isDir = link.endsWith('/');
					const tooltip = isDir ? 'Reveal Folder ' : 'Open File ';
					const tl = {
						startIndex: partialLinkMatches.index,
						length: partialLinkMatches[i].length,
						tooltip: tooltip,
						data: link,
						inEditor: true,
						isDir: isDir,
					};
					links.push(tl);
				}
			}
		}
	} while (partialLinkMatches);
}

export function openRelativeLinkInWorkspace(file: string, isDir: boolean, manager: Manager) {
	const isWorkspaceFile = PathUtil.PathExistsRelativeToWorkspace(file);
	const fullPath = isWorkspaceFile
		? PathUtil.GetWorkspace()?.uri + file
		: 'file:///' + manager.DecodeEndpointPath(file);

	const uri = vscode.Uri.parse(fullPath);

	if (isDir) {
		if (!isWorkspaceFile) {
			vscode.window.showErrorMessage(
				'Cannot reveal folder. It is not in the open workspace.'
			);
		}
		vscode.commands.executeCommand('revealInExplorer', uri);
	} else {
		vscode.commands.executeCommand('vscode.open', uri);
	}
}
