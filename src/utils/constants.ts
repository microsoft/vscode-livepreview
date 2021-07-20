import * as vscode from 'vscode';

export const WS_URL_PLACEHOLDER = '${WS_URL}';
export const HTTP_URL_PLACEHOLDER = '${HTTP_URL}';

export const INIT_PANEL_TITLE = '/';

export const DONT_SHOW_AGAIN: vscode.MessageItem = {
	title: "Don't Show Again",
};

export const OPEN_EXTERNALLY: vscode.MessageItem = {
	title: 'Open Externally',
};

export const HOST = '127.0.0.1';

export const EXTENSION_ID = 'ms-vscode.live-server';

export const OUTPUT_CHANNEL_NAME = 'Embedded Live Preview Console';

export const INJECTED_ENDPOINT_NAME = '/___vscode_livepreview_injected_script';

export const UriSchemes: any = {
	file: 'file',
	vscode_webview: 'vscode-webview',
	vscode_userdata: 'vscode-userdata',
	untitled: 'untitled',
};

export const LIVE_PREVIEW_SERVER_ON = 'LivePreviewServerOn';
