import * as vscode from 'vscode';
import * as bp from './browserPreview';
import { getWebviewOptions, Manager } from './manager';

export function activate(context: vscode.ExtensionContext) {
	const manager = new Manager(context.extensionUri);

	context.subscriptions.push(
		vscode.commands.registerCommand('liveserver.start', () => {
			manager.openServer(true);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('liveserver.start.withpreview', () => {
			manager.createOrShowPreview();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('liveserver.end', () => {
			manager.closeServer(true);
		})
	);

	if (vscode.window.registerWebviewPanelSerializer) {
		vscode.window.registerWebviewPanelSerializer(bp.BrowserPreview.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
				// Reset the webview options so we use latest uri for `localResourceRoots`.
				webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
				manager.createOrShowPreview(webviewPanel);
				// bp.BrowserPreview.revive(webviewPanel, context.extensionUri);
			},
		});
	}
}
