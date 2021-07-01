import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { BrowserPreview } from './editorPreview/browserPreview';
import { getWebviewOptions, Manager } from './manager';
import { EXTENSION_ID } from './utils/constants';
import { SETTINGS_SECTION_ID, SettingUtil } from './utils/settingsUtil';
import { GetActiveFile } from './utils/utils';

let reporter: TelemetryReporter;
let manager: Manager;

export function activate(context: vscode.ExtensionContext) {
	const extPackageJSON = context.extension.packageJSON;

	reporter = new TelemetryReporter(
		EXTENSION_ID,
		extPackageJSON.version,
		extPackageJSON.aiKey
	);
	context.subscriptions.push(reporter);

	manager = new Manager(context.extensionUri, reporter);
	/* __GDPR__
		"extension.startUp" : { 
			"numWorkspaceFolders" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
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
			`${SETTINGS_SECTION_ID}.config.selectWorkspace`,
			() => {
				SettingUtil.UpdateWorkspacePath(manager);
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
			manager.createOrShowEmbeddedPreview(undefined, file, isRelative);
		} else {
			manager.showPreviewInBrowser(file, isRelative);
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
			`${SETTINGS_SECTION_ID}.start.externalPreview.atIndex`,
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
				manager.createOrShowEmbeddedPreview();
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
				let file = unescape(state.currentAddress) ?? '/';

				if (!manager.pathExistsRelativeToWorkspace(file)) {
					file = '/';
				}

				if (file == '/' && !manager.workspace) {
					// root will not show anything, so cannot revive content. Dispose.
					webviewPanel.dispose();
					return;
				}
				// Reset the webview options so we use latest uri for `localResourceRoots`.
				webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
				manager.createOrShowEmbeddedPreview(webviewPanel, file);
			},
		});
	}
}

export function deactivate(): void {
	reporter.dispose();
	console.log("deactivate!");
	manager.dispose();
}
