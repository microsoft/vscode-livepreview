import * as vscode from 'vscode';

/**
 * @description the object representation of the extension settings.
 */
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
	debugOnExternalPreview: boolean;
}

/**
 * @description Options for the preview refresh settings dropdown.
 */
export enum AutoRefreshPreview {
	onAnyChange = 'On All Changes in Editor',
	onSave = 'On Changes to Saved Files',
	never = 'Never',
}

/**
 * @description Options for the preview target settings dropdown.
 */
export enum OpenPreviewTarget {
	embeddedPreview = 'Embedded Preview',
	externalBrowser = 'External Browser',
}

/**
 * @description prefix for all extension contributions for Live Preview
 */
export const SETTINGS_SECTION_ID = 'livePreview';

/**
 * @description contains the string constants for all settings (`SETTINGS_SECTION_ID`.`).
 */
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
	debugOnExternalPreview: 'debugOnExternalPreview',
};

/**
 * @description the potential previewType for commands (formatted as `${SETTINGS_SECTION_ID}.start.${previewType}.${target}`).
 */
export const PreviewType: any = {
	internalPreview: 'internalPreview',
	externalPreview: 'externalPreview',
	externalDebugPreview: 'externalDebugPreview',
};

export class SettingUtil {
	/**
	 * @description Get the current settings JSON.
	 * @param {vscode.Uri} extensionUri the extension URI
	 * @returns {LiveServerConfigItem} the LiveServerConfigItem, which is a JSON object with all of the settings for Live Preview.
	 */
	public static GetConfig(extensionUri: vscode.Uri): LiveServerConfigItem {
		const config = vscode.workspace.getConfiguration(
			SETTINGS_SECTION_ID,
			extensionUri
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
			debugOnExternalPreview: config.get<boolean>(
				Settings.debugOnExternalPreview,
				true
			),
		};
	}

	/**
	 * @description Get the preferred preview target from settings.
	 * @param {vscode.Uri} extensionUri the extension URI.
	 * @returns {string} the constant in the command string indicating internal or external preview.
	 */
	public static GetPreviewType(extensionUri: vscode.Uri): string {
		if (
			SettingUtil.GetConfig(extensionUri).openPreviewTarget ==
			OpenPreviewTarget.embeddedPreview
		) {
			return PreviewType.internalPreview;
		} else {
			return SettingUtil.GetExternalPreviewType(extensionUri);
		}
	}

	public static GetExternalPreviewType(extensionUri: vscode.Uri): string {
		if (SettingUtil.GetConfig(extensionUri).debugOnExternalPreview) {
			return PreviewType.externalDebugPreview;
		} else {
			return PreviewType.externalPreview;
		}
	}
	/**
	 * @description Update a Live Preview setting
	 * @param {string} settingSuffix the suffix, `livePreview.<suffix>` of the setting to set.
	 * @param {T} value the value to set the setting to.
	 * @param {boolean} isGlobal whether to set the user setting, defaults to false.
	 */
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
