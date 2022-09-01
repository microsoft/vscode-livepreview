import './setupNls';
import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { EXTENSION_ID } from './utils/constants';
import { PathUtil } from './utils/pathUtil';
import {
	PreviewType,
	Settings,
	SETTINGS_SECTION_ID,
	SettingUtil,
} from './utils/settingsUtil';
import { IOpenFileOptions, Manager } from './manager';
import { ServerGrouping } from './server/serverGrouping';

let reporter: TelemetryReporter;
let serverPreview: Manager;

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
			const filePath = SettingUtil.GetConfig().defaultPreviewPath;
			serverPreview.openPreviewAtFileString(filePath);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.preview.atFile`,
			(file?: vscode.Uri, options?: IOpenFileOptions) => {
				serverPreview.openPreviewAtFileUri(file, options);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.debugPreview.atFile`,
			async (file?: vscode.Uri, options?: IOpenFileOptions) => {
				// TODO: implement internalDebugPreview and use settings to choose which one to launch
				await serverPreview.openPreviewAtFileUri(
					file,
					options,
					PreviewType.externalDebugPreview
				);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.externalPreview.atFile`,
			async (file?: vscode.Uri, options?: IOpenFileOptions) => {
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
				await serverPreview.openPreviewAtFileUri(
					file,
					options,
					PreviewType.externalPreview
				);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.internalPreview.atFile`,
			async (file?: vscode.Uri, options?: IOpenFileOptions) => {
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
				await serverPreview.openPreviewAtFileUri(
					file,
					options,
					PreviewType.internalPreview
				);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.externalDebugPreview.atFile`,
			async (file?: vscode.Uri, options?: IOpenFileOptions) => {
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
				await serverPreview.openPreviewAtFileUri(
					file,
					options,
					PreviewType.externalDebugPreview
				);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(`${SETTINGS_SECTION_ID}.end`, () => {
			/* __GDPR__
				"server.forceClose" : {}
			*/
			reporter.sendTelemetryEvent('server.forceClose');
			serverPreview.showCloseServerPicker();
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
	serverPreview.closePanel();
	serverPreview.dispose();
}
