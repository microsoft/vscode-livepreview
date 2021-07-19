import * as vscode from 'vscode';

export interface LiveServerConfigItem {
	portNumber: number;
	showStatusBarItem: boolean;
	showServerStatusNotifications: boolean;
	autoRefreshPreview: AutoRefreshPreview;
	browserPreviewLaunchServerLogging: boolean;
	openPreviewTarget: OpenPreviewTarget;
	serverKeepAliveAfterEmbeddedPreviewClose: number;
	notifyOnOpenLooseFile: boolean;
	runTaskWithExternalPreview: boolean;
	defaultPreviewPath: string;
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

export const SETTINGS_SECTION_ID = 'livePreview';

export const Settings: any = {
	portNumber: 'portNumber',
	showStatusBarItem: 'showStatusBarItem',
	showServerStatusNotifications: 'showServerStatusNotifications',
	autoRefreshPreview: 'autoRefreshPreview',
	browserPreviewLaunchServerLogging: 'tasks.browserPreviewLaunchServerLogging',
	openPreviewTarget: 'openPreviewTarget',
	serverKeepAliveAfterEmbeddedPreviewClose:
		'serverKeepAliveAfterEmbeddedPreviewClose',
	notifyOnOpenLooseFile: 'notifyOnOpenLooseFile',
	runTaskWithExternalPreview: 'tasks.runTaskWithExternalPreview',
	defaultPreviewPath: 'defaultPreviewPath',
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
			showServerStatusNotifications: config.get<boolean>(
				Settings.showServerStatusNotifications,
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
			runTaskWithExternalPreview: config.get<boolean>(
				Settings.runTaskWithExternalPreview,
				true
			),
			defaultPreviewPath: config.get<string>(Settings.defaultPreviewPath, ''),
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
		isGlobal = true
	): void {
		vscode.workspace
			.getConfiguration(SETTINGS_SECTION_ID)
			.update(settingSuffix, value, isGlobal);
	}
}
