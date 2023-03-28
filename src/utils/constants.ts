/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export const WS_URL_PLACEHOLDER = '${WS_URL}';
export const HTTP_URL_PLACEHOLDER = '${HTTP_URL}';

export const INIT_PANEL_TITLE = '/';

export const DONT_SHOW_AGAIN: vscode.MessageItem = {
	title: localize('dont show again', "Don't Show Again"),
};

export const OPEN_EXTERNALLY: vscode.MessageItem = {
	title: localize('open externally', 'Open Externally'),
};

export const DEFAULT_HOST = '127.0.0.1';

export const EXTENSION_ID = 'ms-vscode.live-server';

export const OUTPUT_CHANNEL_NAME = localize(
	'output channel name',
	'Embedded Live Preview Console'
);

export const INJECTED_ENDPOINT_NAME = '/___vscode_livepreview_injected_script';

export const UriSchemes: any = {
	file: 'file',
	vscode_webview: 'vscode-webview',
	vscode_userdata: 'vscode-userdata',
	untitled: 'untitled',
};

export const LIVE_PREVIEW_SERVER_ON = 'LivePreviewServerOn';

export const TASK_TERMINAL_BASE_NAME = localize('task name', 'Run Server');

export const DEFAULT_HTTP_HEADERS = { 'Accept-Ranges': 'bytes' };