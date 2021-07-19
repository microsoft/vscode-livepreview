import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { BrowserPreview } from './editorPreview/browserPreview';
import { Manager } from './manager';
import { EXTENSION_ID } from './utils/constants';
import { PathUtil } from './utils/pathUtil';
import {
	Settings,
	SETTINGS_SECTION_ID,
	SettingUtil,
} from './utils/settingsUtil';

let reporter: TelemetryReporter;
let manager: Manager;

export function activate(context: vscode.ExtensionContext): void {
	const extPackageJSON = context.extension.packageJSON;
	reporter = new TelemetryReporter(
		EXTENSION_ID,
		extPackageJSON.version,
		extPackageJSON.aiKey
	);

	manager = new Manager(
		context.extensionUri,
		reporter,
		PathUtil.GetUserDataDirFromStorageUri(context.storageUri?.fsPath)
	);

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

	const openPreview = (
		internal: boolean,
		file: string,
		isRelative: boolean,
		debug = false
	) => {
		if (internal) {
			// for now, ignore debug or no debug for embedded preview
			manager.createOrShowEmbeddedPreview(undefined, file, isRelative);
		} else {
			manager.showPreviewInBrowser(file, isRelative, debug);
		}
	};

	const handleOpenFile = (
		internal: boolean,
		file: any,
		fileStringRelative = true,
		debug = false
	) => {
		if (typeof file == 'string') {
			openPreview(internal, file, fileStringRelative, debug);
			return;
		} else if (file instanceof vscode.Uri) {
			const filePath = file?.fsPath;
			if (filePath) {
				openPreview(internal, filePath, false, debug);
				return;
			} else {
				const activeFilePath =
					vscode.window.activeTextEditor?.document.fileName;
				if (activeFilePath) {
					openPreview(internal, activeFilePath, false, debug);
					return;
				}
			}
		} else {
			const activeFilePath = vscode.window.activeTextEditor?.document.fileName;
			if (activeFilePath) {
				openPreview(internal, activeFilePath, false, debug);
				return;
			}
		}

		vscode.window.showErrorMessage(
			'This file is not a part of the workspace where the server has started. Cannot preview.'
		);
		return;
	};

	context.subscriptions.push(reporter);

	context.subscriptions.push(
		vscode.commands.registerCommand(`${SETTINGS_SECTION_ID}.start`, () => {
			const filePath = SettingUtil.GetConfig(
				context.extensionUri
			).defaultPreviewPath;
			if (filePath == '') {
				if (manager.workspace) {
					vscode.commands.executeCommand(
						`${SETTINGS_SECTION_ID}.start.preview.atIndex`
					);
				} else {
					manager.openServer();
				}
			} else {
				vscode.commands.executeCommand(
					`${SETTINGS_SECTION_ID}.start.preview.atFile`,
					filePath,
					manager.pathExistsRelativeToWorkspace(filePath)
				);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.preview.atFile`,
			(file?: any, relativeFileString = true) => {
				const previewType = SettingUtil.GetPreviewType(context.extensionUri);
				vscode.commands.executeCommand(
					`${SETTINGS_SECTION_ID}.start.${previewType}.atFile`,
					file,
					relativeFileString
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

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.setDefaultOpenFile`,
			(file: vscode.Uri) => {
				if (manager.absPathInDefaultWorkspace(file.fsPath)) {
					const fileRelativeToWorkspace =
						manager.getFileRelativeToDefaultWorkspace(file.fsPath);
					SettingUtil.UpdateSettings(
						Settings.defaultPreviewPath,
						fileRelativeToWorkspace,
						false
					);
				} else {
					SettingUtil.UpdateSettings(
						Settings.defaultPreviewPath,
						file.fsPath,
						false
					);
				}
			}
		)
	);

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
			(file?: any, relativeFileString = true) => {
				/* __GDPR__
					"preview" :{
						"type" : {"classification": "SystemMetaData", "purpose": "FeatureInsight"},
						"location" : {"classification": "SystemMetaData", "purpose": "FeatureInsight"}
					}
				*/
				reporter.sendTelemetryEvent('preview', {
					type: 'external',
					location: 'atFile',
					debug: 'false',
				});
				handleOpenFile(false, file, relativeFileString);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.internalPreview.atFile`,
			(file?: any, relativeFileString = true) => {
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
				handleOpenFile(true, file, relativeFileString);
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

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.externalDebug.atFile`,
			(file?: any, relativeFileString = true) => {
				/* __GDPR__
					"preview" :{
						"type" : {"classification": "SystemMetaData", "purpose": "FeatureInsight"},
						"location" : {"classification": "SystemMetaData", "purpose": "FeatureInsight"}
					}
				*/
				reporter.sendTelemetryEvent('preview', {
					type: 'external',
					location: 'atFile',
					debug: 'true',
				});
				handleOpenFile(false, file, relativeFileString, true);
			}
		)
	);

	if (vscode.window.registerWebviewPanelSerializer) {
		vscode.window.registerWebviewPanelSerializer(BrowserPreview.viewType, {
			async deserializeWebviewPanel(
				webviewPanel: vscode.WebviewPanel,
				state: any
			) {
				let relative = true;
				let file = unescape(state.currentAddress) ?? '/';

				if (!manager.pathExistsRelativeToWorkspace(file)) {
					const absFile = manager.decodeEndpoint(file);
					file = absFile ?? '/';
					relative = false;
				}

				if (file == '/' && !manager.workspace) {
					// root will not show anything, so cannot revive content. Dispose.
					webviewPanel.dispose();
					return;
				}
				webviewPanel.webview.options = manager.getWebviewOptions();
				manager.createOrShowEmbeddedPreview(webviewPanel, file, relative);
			},
		});
	}
}

export function deactivate(): void {
	reporter.dispose();
	manager.dispose();
}
