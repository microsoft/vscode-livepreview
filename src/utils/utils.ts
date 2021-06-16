import * as vscode from 'vscode';
import {
	GO_TO_SETTINGS,
	Settings,
	SETTINGS_SECTION_ID,
	PreviewType,
} from './constants';
interface LiveServerConfigItem {
	portNum: number;
	showStatusBarItem: boolean;
	showServerStatusPopUps: boolean;
	autoRefreshPreview: AutoRefreshPreview;
	browserPreviewLaunchServerLogging: boolean;
	openPreviewTarget: OpenPreviewTarget;
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

export function FormatDateTime(date: Date, delimeter = ', '): string {
	const mm = date.getMonth() + 1;
	const dd = date.getDate().toString().padStart(2, '0');
	const yy = date.getFullYear().toString().substring(2);

	const hh = date.getHours();
	const mi = date.getMinutes().toString().padStart(2, '0');
	const ss = date.getSeconds().toString().padStart(2, '0');

	return `${mm}/${dd}/${yy}${delimeter}${hh}:${mi}:${ss}`;
}

export function FormatFileSize(bytes: number) {
	const sizeUnits = ['B', 'kB', 'MB', 'GB'];

	let i = 0;
	while (i < sizeUnits.length) {
		if (bytes < Math.pow(1024, i + 1)) {
			const modifiedSize = (bytes / Math.pow(1024, i)).toFixed(1);
			return `${modifiedSize} ${sizeUnits[i]}`;
		}
		i++;
	}
	const modifiedSize = (bytes / Math.pow(1024, i)).toFixed(1);
	return `${modifiedSize} TB`;
}

export function GetConfig(resource: vscode.Uri): LiveServerConfigItem {
	const config = vscode.workspace.getConfiguration(
		SETTINGS_SECTION_ID,
		resource
	);
	return {
		portNum: config.get<number>('portNum', 3000),
		showStatusBarItem: config.get<boolean>('showStatusBarItem', true),
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
	};
}

export function GetRelativeActiveFile(): string {
	const activeFile = vscode.window.activeTextEditor?.document.fileName;
	return activeFile ? GetRelativeFile(activeFile) : '';
}

export function GetRelativeFile(file: string): string {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
	const ret = file.substr(workspaceFolder?.length ?? 0).replace(/\\/gi, '/');
	return ret;
}

export function SettingsSavedMessage(): void {
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

export function UpdateSettings<T>(
	settingSuffix: string,
	value: T,
	isGlobal = true
): void {
	vscode.workspace
		.getConfiguration(SETTINGS_SECTION_ID)
		.update(settingSuffix, value, isGlobal);
	SettingsSavedMessage();
}

export function GetPreviewType(extensionUri: vscode.Uri): string {
	console.log(GetConfig(extensionUri).openPreviewTarget);
	if (
		GetConfig(extensionUri).openPreviewTarget ==
		OpenPreviewTarget.embeddedPreview
	) {
		return PreviewType.internalPreview;
	} else {
		return PreviewType.externalPreview;
	}
}
