import './setupNls';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import TelemetryReporter from 'vscode-extension-telemetry';
import { BrowserPreview } from './editorPreview/browserPreview';
import { ServerGrouping } from './serverGrouping';
import { EXTENSION_ID } from './utils/constants';
import { PathUtil } from './utils/pathUtil';
import {
	Settings,
	SETTINGS_SECTION_ID,
	SettingUtil,
} from './utils/settingsUtil';
import { existsSync } from 'fs';

let reporter: TelemetryReporter;
let managers: Map<vscode.Uri, ServerGrouping>;
let looseFileManager: ServerGrouping;

const localize = nls.loadMessageBundle();

export function activate(context: vscode.ExtensionContext): void {
	const extPackageJSON = context.extension.packageJSON;
	reporter = new TelemetryReporter(
		EXTENSION_ID,
		extPackageJSON.version,
		extPackageJSON.aiKey
	);

		managers = new Map<vscode.Uri, ServerGrouping>();
	// let manager = new HostedContent(
	// 	context.extensionUri,
	// 	reporter,
	// 	PathUtil.GetUserDataDirFromStorageUri(context.storageUri?.fsPath)
	// );

	const createHostedContentForWorkspace = (
		workspace: vscode.WorkspaceFolder | undefined
	) => {
		return new ServerGrouping(
				context.extensionUri,
				reporter,
				workspace,
				PathUtil.GetUserDataDirFromStorageUri(context.storageUri?.fsPath)
			);
	};
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
		hc: ServerGrouping,
		isRelative: boolean,
		debug = false,
	) => {
		if (internal) {
			// for now, ignore debug or no debug for embedded preview
			hc.createOrShowEmbeddedPreview(undefined, file, isRelative);
		} else {
			hc.showPreviewInBrowser(file, isRelative, debug);
		}
	};

	const getHCFromWorkspace = (workspace: vscode.WorkspaceFolder) => {
		const hcFromMap = managers.get(workspace.uri);
					if (hcFromMap) {
						return hcFromMap;
					} else {
						const hc = createHostedContentForWorkspace(workspace);
						managers.set(workspace.uri, hc);
						return hc;
					}
	};

	const getLooseFileHC = () => {
		if (!looseFileManager) {
			looseFileManager = createHostedContentForWorkspace(undefined);
		}
		return looseFileManager;
	};

	const determineHCfromFile = (file: vscode.Uri | string, fileStringRelative: boolean) => {
		if (fileStringRelative) {
			getLooseFileHC();
		} else {
			let fileUri;
			if (typeof file == 'string') {
				fileUri = vscode.Uri.parse(file);
			} else if (file instanceof vscode.Uri) {
				fileUri = file;
			} else {

			getLooseFileHC();
			}
			if (fileUri) {
				const workspace = vscode.workspace.getWorkspaceFolder(fileUri);
				if (workspace) {
					return getHCFromWorkspace(workspace);
				}
			}
		}
	};

	const handleOpenFileCaller = (
		internal: boolean,
		file: vscode.Uri | string | undefined,
		fileStringRelative = true,
		debug = false,
		workspace?: vscode.WorkspaceFolder,
		port?: number,
		hc?: ServerGrouping
		) => {
			if (!file) {
				openNoTarget();
				return;
			}
			if (!hc) {
				if (workspace) {
					hc = getHCFromWorkspace(workspace);
				} else if (port) {
					managers.forEach((potentialHC,key) => {
						if (potentialHC.port === port) {
							hc = potentialHC;
							return;
						}
						hc = determineHCfromFile(file, fileStringRelative);
					});
				} else {
					hc = determineHCfromFile(file, fileStringRelative);
				}
			}
			if (hc) {
				handleOpenFile(internal,file,hc,fileStringRelative,debug);
			}

	};

	const openNoTarget = () => {
		const workspaces = vscode.workspace.workspaceFolders;
				if (workspaces && workspaces.length > 0) {
					for (let i = 0; i < workspaces.length; i++) {
						const currWorkspace = workspaces[i];
						const manager = managers.get(currWorkspace.uri);
						if (manager) {
							vscode.commands.executeCommand(
								`${SETTINGS_SECTION_ID}.start.preview.atFile`,
								'/',
								true,
								currWorkspace,
								undefined,
								manager
							);
							return;
						}
					}
				} else {
					vscode.commands.executeCommand(
						`${SETTINGS_SECTION_ID}.start.preview.atFile`,
						'/',
						false
					);
				}
	};
	const handleOpenFile = (
		internal: boolean,
		file: vscode.Uri | string,
		hc: ServerGrouping,
		fileStringRelative = true,
		debug = false
	) => {
		if (typeof file == 'string') {
			openPreview(internal, file, hc, fileStringRelative, debug);
			return;
		} else if (file instanceof vscode.Uri) {
			console.log(vscode.workspace.getWorkspaceFolder(file));
			const filePath = file?.fsPath;
			if (filePath) {
				openPreview(internal, filePath, hc, false, debug);
				return;
			} else {
				const activeFilePath =
					vscode.window.activeTextEditor?.document.fileName;
				if (activeFilePath) {
					openPreview(internal, activeFilePath, hc,false, debug);
					return;
				}
			}
		} else {
			const activeFilePath = vscode.window.activeTextEditor?.document.fileName;
			if (activeFilePath) {
				openPreview(internal, activeFilePath, hc,false, debug);
				return;
			}
		}

		vscode.window.showErrorMessage(
			localize(
				'notPartOfWorkspaceCannotPreview',
				'This file is not a part of the workspace where the server has started. Cannot preview.'
			)
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
				openNoTarget();

			} else {
				managers.forEach((manager)=> {
					if (manager.pathExistsRelativeToWorkspace(filePath)) {
						vscode.commands.executeCommand(
							`${SETTINGS_SECTION_ID}.start.preview.atFile`,
							filePath,
							true,
							manager.workspace,
							undefined,
							manager
						);
						return;
					}
				});
				if (existsSync(filePath)) {
					vscode.commands.executeCommand(
						`${SETTINGS_SECTION_ID}.start.preview.atFile`,
						filePath,
						false
					);
				} else {
					throw Error();
				}
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.preview.atFile`,
			(file?: vscode.Uri | string, options?:any, relativeFileString = false, workspace?: vscode.WorkspaceFolder, port?: number, manager?: ServerGrouping) => {
				const previewType = SettingUtil.GetPreviewType(context.extensionUri);
				vscode.commands.executeCommand(
					`${SETTINGS_SECTION_ID}.start.${previewType}.atFile`,
					file,
					relativeFileString,
					workspace,
					port,
					manager
				);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.debugPreview.atFile`,
			(file?: vscode.Uri | string, relativeFileString = true, workspace?: vscode.WorkspaceFolder, port?: number, manager?: ServerGrouping) => {
				// TODO: implement internalDebugPreview and use settings to choose which one to launch
				vscode.commands.executeCommand(
					`${SETTINGS_SECTION_ID}.start.externalDebugPreview.atFile`,
					file,
					relativeFileString
				);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.externalPreview.atFile`,
			(file?: vscode.Uri | string, relativeFileString = false, workspace?: vscode.WorkspaceFolder, port?: number, manager?: ServerGrouping) => {
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
				handleOpenFileCaller(false, file, relativeFileString, false, workspace,port, manager);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.internalPreview.atFile`,
			(file?: vscode.Uri | string, relativeFileString = false, workspace?: vscode.WorkspaceFolder, port?: number, manager?: ServerGrouping) => {
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
				handleOpenFileCaller(true, file, relativeFileString, false, workspace,port, manager);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.start.externalDebugPreview.atFile`,
			(file?: vscode.Uri | string, relativeFileString = false, workspace?: vscode.WorkspaceFolder, port?: number, manager?: ServerGrouping) => {
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


				handleOpenFileCaller(false, file, relativeFileString, true, workspace, port, manager);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(`${SETTINGS_SECTION_ID}.end`, () => {
			/* __GDPR__
				"server.forceClose" : {}
			*/
			managers.forEach((manager: ServerGrouping, key: vscode.Uri) => {
				manager.closeServer();
			});
			reporter.sendTelemetryEvent('server.forceClose');

		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			`${SETTINGS_SECTION_ID}.setDefaultOpenFile`,
			(file: vscode.Uri) => {

				const workspace = vscode.workspace.getWorkspaceFolder(file);
				if (workspace) {
					const hc = new ServerGrouping(
						context.extensionUri,
						reporter,
						workspace,
						PathUtil.GetUserDataDirFromStorageUri(context.storageUri?.fsPath));
					managers.set(workspace.uri,hc);

					if (hc.absPathInDefaultWorkspace(file.fsPath)) {
						const fileRelativeToWorkspace =
						hc.getFileRelativeToDefaultWorkspace(file.fsPath) ?? '';
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


			}
		)
	);

	// if (vscode.window.registerWebviewPanelSerializer) {
	// 	vscode.window.registerWebviewPanelSerializer(BrowserPreview.viewType, {
	// 		async deserializeWebviewPanel(
	// 			webviewPanel: vscode.WebviewPanel,
	// 			state: any
	// 		) {
	// 			let relative = true;
	// 			let file = state.currentAddress ?? '/';

	// 			if (!manager.pathExistsRelativeToWorkspace(file)) {
	// 				const absFile = manager.decodeEndpoint(file);
	// 				file = absFile ?? '/';
	// 				relative = false;
	// 			}

	// 			if (file == '/' && !manager.workspace) {
	// 				// root will not show anything, so cannot revive content. Dispose.
	// 				webviewPanel.dispose();
	// 				return;
	// 			}
	// 			webviewPanel.webview.options = manager.getWebviewOptions();
	// 			manager.createOrShowEmbeddedPreview(webviewPanel, file, relative);
	// 		},
	// 	});
	// }
}

export function deactivate(): void {
	reporter.dispose();
	managers.forEach((manager) => {
		manager.dispose();
	});
}
