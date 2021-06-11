import * as vscode from 'vscode';

export const WS_PORTNUM_PLACEHOLDER = '${WS_PORTNUM}';
export const INIT_PANEL_TITLE = '/';

export const CLOSE_SERVER: vscode.MessageItem = {
	title: 'Close Server',
};

export const DONT_CLOSE: vscode.MessageItem = {
	title: "Don't Close",
};

export const GO_TO_SETTINGS: vscode.MessageItem = {
	title: 'Go To Settings',
};

export const DONT_SHOW_AGAIN: vscode.MessageItem = {
	title: "Don't Show Again",
};

export const OPEN_EXTERNALLY: vscode.MessageItem = {
	title: "Open Externally",
};
export const HOST = '127.0.0.1';

export const HAS_SET_CLOSE_PREVEW_BEHAVIOR =
	'liveserver.hasSetClosePreviewBehavior';

export const SETTINGS_SECTION_ID = 'liveserver';

export const Settings: any = {
	portNum: 'portNum',
	showStatusBarItem: 'showStatusBarItem',
	showServerStatusPopUps: 'showServerStatusPopUps',
	autoRefreshPreview: 'autoRefreshPreview',
	launchPreviewOnServerStart: 'launchPreviewOnServerStart',
	closeServerWithEmbeddedPreview: 'closeServerWithEmbeddedPreview',
};
