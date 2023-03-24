/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
		vscode.commands.registerCommand(`${SETTINGS_SECTION_ID}.start`, async () => {

			const activeFile = vscode.window.activeTextEditor?.document.uri;
			const activeWorkspace = activeFile ? vscode.workspace.getWorkspaceFolder(activeFile) : vscode.workspace.workspaceFolders?.[0];

			// use the active workspace folder. otherwise, use the first workspace folder.
			let defaultPreviewPath = SettingUtil.GetConfig(activeWorkspace).defaultPreviewPath;

			// if this gave no results, still try to use the the preview path from other settings, but appended to the active workspace
			// otherwise, still use the active workspace, but with no default path.
			if (defaultPreviewPath === '') {
				defaultPreviewPath = SettingUtil.GetConfig().defaultPreviewPath;
			}

			// defaultPreviewPath is relative to the workspace root, regardless of what is set for serverRoot
			await serverPreview.openPreviewAtFileString(defaultPreviewPath, undefined, activeWorkspace, true);
		})
	);

	/**
	 * Not used directly by the extension, but can be called by a task or another extension to open a preview at a file
	 */
	context.subscriptions.push(
		vscode.commands.registerCommand(`${SETTINGS_SECTION_ID}.start.preview.atFileString`,
			async (filePath?: string) => {
				filePath = filePath ?? '/';
				await serverPreview.openPreviewAtFileString(filePath);
			})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.preview.atFile`,
			async (file?: vscode.Uri, options?: IOpenFileOptions) => {
				await serverPreview.openPreviewAtFileUri(file, options);
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
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.runServerLoggingTask`,
			async (file?: vscode.Uri) => {
				await serverPreview.runTaskForFile(file);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(`${SETTINGS_SECTION_ID}.end`, () => {
			/* __GDPR__
				"server.forceClose" : {}
			*/
			reporter.sendTelemetryEvent('server.forceClose');
			serverPreview.forceCloseServers();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.setDefaultOpenFile`,
			async (file: vscode.Uri) => {
				// Will set the path on workspace folder settings if workspace is open
				// otherwise, it will set user setting.
				const workspace = vscode.workspace.getWorkspaceFolder(file);

				if (!workspace) {
					await SettingUtil.UpdateSettings(
						Settings.defaultPreviewPath,
						PathUtil.ConvertToPosixPath(file.fsPath),
						vscode.ConfigurationTarget.Global
					);
					return;
				}

				const relativeFileStr = file.fsPath.substring(workspace.uri.fsPath.length);
				await SettingUtil.UpdateSettings(
					Settings.defaultPreviewPath,
					PathUtil.ConvertToPosixPath(relativeFileStr),
					vscode.ConfigurationTarget.WorkspaceFolder,
					file
				);
			}
		)
	);
}

export function deactivate(): void {
	serverPreview.closePanel();
	serverPreview.dispose();
}
