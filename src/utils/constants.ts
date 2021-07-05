import * as vscode from 'vscode';

export const WS_PORTNUM_PLACEHOLDER = '${WS_PORTNUM}';

export const INIT_PANEL_TITLE = '/';

export const GO_TO_SETTINGS: vscode.MessageItem = {
	title: 'Go To Settings',
};

export const RELOAD_WINDOW: vscode.MessageItem = {
	title: 'Reload Window',
};

export const DONT_SHOW_AGAIN: vscode.MessageItem = {
	title: "Don't Show Again",
};

export const OPEN_EXTERNALLY: vscode.MessageItem = {
	title: 'Open Externally',
};

export const CONFIG_MULTIROOT: vscode.MessageItem = {
	title: 'Configure Default Server Workspace',
};

export const HOST = '127.0.0.1';

export const EXTENSION_ID = 'ms-vscode.live-server';

export const VSCODE_WEBVIEW = 'vscode-webview';
