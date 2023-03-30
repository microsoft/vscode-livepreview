/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { AutoRefreshPreview, CustomExternalBrowser, ILivePreviewConfigItem, OpenPreviewTarget, SettingUtil } from '../../utils/settingsUtil';

export const testWorkspaces: vscode.WorkspaceFolder[] =
	[
		{
			uri: vscode.Uri.file('C:/Users/TestUser/workspace1'),
			name: '',
			index: 0,
		},
		{
			uri: vscode.Uri.file('C:/Users/TestUser/workspace2'),
			name: '',
			index: 1,
		}
	];

export function makeSetting(nonDefaults: Partial<ILivePreviewConfigItem>): ILivePreviewConfigItem {
	return {
		serverRoot: '',
		portNumber: 0,
		showServerStatusNotifications: false,
		autoRefreshPreview: AutoRefreshPreview.onAnyChange,
		openPreviewTarget: OpenPreviewTarget.embeddedPreview,
		serverKeepAliveAfterEmbeddedPreviewClose: 0,
		notifyOnOpenLooseFile: false,
		runTaskWithExternalPreview: false,
		defaultPreviewPath: '',
		debugOnExternalPreview: false,
		hostIP: '',
		customExternalBrowser: CustomExternalBrowser.edge,
		previewDebounceDelay: 0,
		...nonDefaults
	};
}