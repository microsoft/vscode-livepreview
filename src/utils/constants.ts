import * as vscode from 'vscode';

export const WS_URL_PLACEHOLDER = '${WS_URL}';
export const HTTP_URL_PLACEHOLDER = '${HTTP_URL}';

export const INIT_PANEL_TITLE = '/';

export const GO_TO_SETTINGS: vscode.MessageItem = {
	title: 'Go To Settings',
};

export const DONT_SHOW_AGAIN: vscode.MessageItem = {
	title: "Don't Show Again",
};

export const OPEN_EXTERNALLY: vscode.MessageItem = {
	title: 'Open Externally',
};

export const HOST = '127.0.0.1';

export const EXTENSION_ID = 'ms-vscode.live-server';

export const VSCODE_WEBVIEW = 'vscode-webview';

export const OUTPUT_CHANNEL_NAME = 'Embedded Live Preview Console';