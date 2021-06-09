import * as vscode from 'vscode';
import { BrowserPreview } from './editorPreview/browserPreview';
import { getWebviewOptions, Manager } from './manager';

export function activate(context: vscode.ExtensionContext) {
	const manager = new Manager(context.extensionUri);

	context.subscriptions.push(
		vscode.commands.registerCommand('liveserver.start', () => {
			manager.openServer(true);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('liveserver.start.preview.atIndex', () => {
			manager.createOrShowPreview();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'liveserver.start.preview.atActiveFile',
			() => {
				const workspaceFolder =
					vscode.workspace.workspaceFolders?.[0].uri.fsPath;
				const activeFile = vscode.window.activeTextEditor?.document.fileName;

				const relativeActiveFile = activeFile
					?.substr(workspaceFolder?.length ?? 0)
					.replace(/\\/gi, '/');
				manager.createOrShowPreview(undefined, relativeActiveFile);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('liveserver.end', () => {
			manager.closeServer(true);
		})
	);

	if (vscode.window.registerWebviewPanelSerializer) {
		vscode.window.registerWebviewPanelSerializer(BrowserPreview.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
				// Reset the webview options so we use latest uri for `localResourceRoots`.
				webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
				manager.createOrShowPreview(webviewPanel, webviewPanel.title);
			},
		});
	}
}
