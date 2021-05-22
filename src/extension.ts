import * as vscode from 'vscode';
import * as bp from './BrowserPreview'

export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(
		vscode.commands.registerCommand('server.start', ()  => {
			bp.BrowserPreview.createOrShow(context.extensionUri);
		})
	);
	
	context.subscriptions.push(
		vscode.commands.registerCommand('server.preview.refresh', ()  => {
			bp.BrowserPreview.refreshBrowserPreview();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('server.end', ()  => {
			bp.BrowserPreview.closeServer();
		})
	);


	if (vscode.window.registerWebviewPanelSerializer) {
		vscode.window.registerWebviewPanelSerializer(bp.BrowserPreview.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
				// Reset the webview options so we use latest uri for `localResourceRoots`.
				webviewPanel.webview.options = bp.getWebviewOptions(context.extensionUri);
				bp.BrowserPreview.revive(webviewPanel, context.extensionUri);
			}
		});

	}


}


