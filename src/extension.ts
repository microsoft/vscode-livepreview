import './setupNls';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import TelemetryReporter from 'vscode-extension-telemetry';
import { BrowserPreview } from './editorPreview/browserPreview';
import { EXTENSION_ID } from './utils/constants';
import { PathUtil } from './utils/pathUtil';
import {
	Settings,
	SETTINGS_SECTION_ID,
	SettingUtil,
} from './utils/settingsUtil';
import { Manager } from './manager';
import { ServerManager } from './server/serverManager';

let reporter: TelemetryReporter;
let serverPreview: Manager;

interface openFileOptions {
	relativeFileString?: boolean;
	workspace?: vscode.WorkspaceFolder;
	port?: number;
	manager?: ServerManager;
}

export function activate(context: vscode.ExtensionContext): void {
	const extPackageJSON = context.extension.packageJSON;
	reporter = new TelemetryReporter(
		EXTENSION_ID,
		extPackageJSON.version,
		extPackageJSON.aiKey
	);

	serverPreview = new Manager(
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

	context.subscriptions.push(reporter);

	context.subscriptions.push(
		vscode.commands.registerCommand(`${SETTINGS_SECTION_ID}.start`, () => {
			const filePath = SettingUtil.GetConfig(
				context.extensionUri
			).defaultPreviewPath;
			serverPreview.openTargetAtFile(filePath);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.preview.atFile`,
			(file?: vscode.Uri | string, options?: openFileOptions) => {
				const previewType = SettingUtil.GetPreviewType(context.extensionUri);
				vscode.commands.executeCommand(
					`${SETTINGS_SECTION_ID}.start.${previewType}.atFile`,
					file,
					options
				);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.debugPreview.atFile`,
			(file?: vscode.Uri | string, options?: openFileOptions) => {
				// TODO: implement internalDebugPreview and use settings to choose which one to launch
				vscode.commands.executeCommand(
					`${SETTINGS_SECTION_ID}.start.externalDebugPreview.atFile`,
					file,
					options
				);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.externalPreview.atFile`,
			(file?: vscode.Uri | string, options?: openFileOptions) => {
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
				serverPreview.handleOpenFile(
					false,
					file,
					options?.relativeFileString ?? false,
					false,
					options?.workspace,
					options?.port,
					options?.manager
				);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.internalPreview.atFile`,
			(file?: vscode.Uri | string, options?: openFileOptions) => {
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
				serverPreview.handleOpenFile(
					true,
					file,
					options?.relativeFileString ?? false,
					false,
					options?.workspace,
					options?.port,
					options?.manager
				);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.externalDebugPreview.atFile`,
			(file?: vscode.Uri | string, options?: openFileOptions) => {
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

				serverPreview.handleOpenFile(
					false,
					file,
					options?.relativeFileString ?? false,
					true,
					options?.workspace,
					options?.port,
					options?.manager
				);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(`${SETTINGS_SECTION_ID}.end`, () => {
			/* __GDPR__
				"server.forceClose" : {}
			*/
			serverPreview.closeServers();
			reporter.sendTelemetryEvent('server.forceClose');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.setDefaultOpenFile`,
			(file: vscode.Uri) => {
				SettingUtil.UpdateSettings(
					Settings.defaultPreviewPath,
					file.fsPath,
					false
				);
			}
		)
	);
}

export function deactivate(): void {
	reporter.dispose();
	serverPreview.dispose();
}
