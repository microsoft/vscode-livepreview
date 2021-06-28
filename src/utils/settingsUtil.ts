import * as vscode from 'vscode';
import { GO_TO_SETTINGS, RELOAD_WINDOW } from './constants';

export interface LiveServerConfigItem {
	portNumber: number;
	showStatusBarItem: boolean;
	showServerStatusPopUps: boolean;
	autoRefreshPreview: AutoRefreshPreview;
	browserPreviewLaunchServerLogging: boolean;
	openPreviewTarget: OpenPreviewTarget;
	serverKeepAliveAfterEmbeddedPreviewClose: number;
	notifyOnOpenLooseFile: boolean;
	serverWorkspace: string;
	showWarningOnMultiRootOpen: boolean;
}

export enum AutoRefreshPreview {
	onAnyChange = 'On All Changes in Editor',
	onSave = 'On Changes to Saved Files',
	never = 'Never',
}

export enum OpenPreviewTarget {
	embeddedPreview = 'Embedded Preview',
	externalBrowser = 'External Browser',
}

export const SETTINGS_SECTION_ID = 'LivePreview';

export const Settings: any = {
	portNumber: 'portNumber',
	showStatusBarItem: 'showStatusBarItem',
	showServerStatusPopUps: 'showServerStatusPopUps',
	autoRefreshPreview: 'autoRefreshPreview',
	browserPreviewLaunchServerLogging: 'browserPreviewLaunchServerLogging',
	openPreviewTarget: 'openPreviewTarget',
	serverKeepAliveAfterEmbeddedPreviewClose:
		'serverKeepAliveAfterEmbeddedPreviewClose',
	notifyOnOpenLooseFile: 'notifyOnOpenLooseFile',
	serverWorkspace: 'serverWorkspace',
	showWarningOnMultiRootOpen: 'showWarningOnMultiRootOpen',
};
export const PreviewType: any = {
	internalPreview: 'internalPreview',
	externalPreview: 'externalPreview',
};
export class SettingUtil {
	public static GetConfig(resource: vscode.Uri): LiveServerConfigItem {
		const config = vscode.workspace.getConfiguration(
			SETTINGS_SECTION_ID,
			resource
		);
		return {
			portNumber: config.get<number>(Settings.portNumber, 3000),
			showStatusBarItem: config.get<boolean>(Settings.showStatusBarItem, true),
			showServerStatusPopUps: config.get<boolean>(
				Settings.showServerStatusPopUps,
				false
			),
			autoRefreshPreview: config.get<AutoRefreshPreview>(
				Settings.autoRefreshPreview,
				AutoRefreshPreview.onAnyChange
			),
			browserPreviewLaunchServerLogging: config.get<boolean>(
				Settings.browserPreviewLaunchServerLogging,
				true
			),
			openPreviewTarget: config.get<OpenPreviewTarget>(
				Settings.openPreviewTarget,
				OpenPreviewTarget.embeddedPreview
			),
			serverKeepAliveAfterEmbeddedPreviewClose: config.get<number>(
				Settings.serverKeepAliveAfterEmbeddedPreviewClose,
				20
			),
			notifyOnOpenLooseFile: config.get<boolean>(
				Settings.notifyOnOpenLooseFile,
				true
			),
			serverWorkspace: config.get<string>(Settings.serverWorkspace, ''),
			showWarningOnMultiRootOpen: config.get<boolean>(
				Settings.showWarningOnMultiRootOpen,
				true
			),
		};
	}
	public static GetPreviewType(extensionUri: vscode.Uri): string {
		if (
			SettingUtil.GetConfig(extensionUri).openPreviewTarget ==
			OpenPreviewTarget.embeddedPreview
		) {
			return PreviewType.internalPreview;
		} else {
			return PreviewType.externalPreview;
		}
	}

	public static UpdateSettings<T>(
		settingSuffix: string,
		value: T,
		isGlobal = true,
		showGotoSettings = true
	): void {
		vscode.workspace
			.getConfiguration(SETTINGS_SECTION_ID)
			.update(settingSuffix, value, isGlobal);
		if (showGotoSettings) {
			SettingUtil.SettingsSavedMessage();
		}
	}

	public static SettingsSavedMessage(): void {
		vscode.window
			.showInformationMessage(
				'Your selection has been saved in settings.',
				GO_TO_SETTINGS
			)
			.then((selection: vscode.MessageItem | undefined) => {
				if (selection === GO_TO_SETTINGS) {
					vscode.commands.executeCommand(
						'workbench.action.openSettings',
						SETTINGS_SECTION_ID
					);
				}
			});
	}

	public static UpdateWorkspacePath() {
		// choose workspace path:
		const workspacePaths = vscode.workspace.workspaceFolders?.map(
			(e) => e.uri.fsPath
		);
		let workspacePath: string;

		if (!workspacePaths) {
			vscode.window.showErrorMessage('No workspaces open.');
			return;
		} else if (workspacePaths.length == 1) {
			vscode.window.showErrorMessage(
				'Only one workspace open, cannot select another one.'
			);
			return;
		}

		vscode.window
			.showQuickPick(workspacePaths, {
				placeHolder: 'Choose Default Workspace for Live Server',
			})
			.then((workspacePath) => {
				if (!workspacePath) {
					return;
				}

				SettingUtil.UpdateSettings(
					Settings.serverWorkspace,
					workspacePath,
					false,
					false
				);

				vscode.window
					.showInformationMessage(
						`Reload window to use new workspace: ${workspacePath}`,
						RELOAD_WINDOW
					)
					.then((selection: vscode.MessageItem | undefined) => {
						if (selection === RELOAD_WINDOW) {
							vscode.commands.executeCommand('workbench.action.reloadWindow');
						}
					});
			});
	}
}
