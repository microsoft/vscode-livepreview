import * as vscode from 'vscode';

export const PORTNUM = 3000;
export const WS_PORTNUM = 3500;
export const WS_PORTNUM_PLACEHOLDER = '${WS_PORTNUM}';
export const INIT_PANEL_TITLE = 'LocalHost Preview';

export const CLOSE_SERVER: vscode.MessageItem = {
	title: 'Close Server',
};

export const DONT_CLOSE: vscode.MessageItem = {
	title: "Don't Close",
};
