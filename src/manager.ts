import * as vscode from 'vscode';
import { BrowserPreview } from './editorPreview/browserPreview';
import { Disposable } from './utils/dispose';
import { Server } from './server/serverManager';
import {
	INIT_PANEL_TITLE,
	CLOSE_SERVER,
	DONT_CLOSE,
	HOST,
	HAS_SET_CLOSE_PREVEW_BEHAVIOR,
	SETTINGS_SECTION_ID
} from './utils/constants';
import { GetConfig, SettingsSavedMessage } from './utils/utils';

export class Manager extends Disposable {
	public currentPanel: BrowserPreview | undefined;
	private readonly _server: Server;
	private readonly _extensionUri: vscode.Uri;
	private readonly _path: vscode.WorkspaceFolder | undefined;
	private readonly _globalState;

	// always leave off at previous port numbers to avoid retrying on many busy ports
	private _serverPort: number;
	private _serverWSPort: number;

	constructor(extensionUri: vscode.Uri, globalState: vscode.Memento) {
		super();
		this._extensionUri = extensionUri;
		this._globalState = globalState;
		this._serverPort = GetConfig(extensionUri).portNum;
		this._serverWSPort = GetConfig(extensionUri).portNum;
		this._path = vscode.workspace.workspaceFolders?.[0];
		this._server = this._register(new Server(extensionUri));
		this._server.onPortChange((e) => {
			if (this.currentPanel) {
				this._serverPort = e.port ?? this._serverPort;
				this._serverWSPort = e.ws_port ?? this._serverWSPort;
				this.currentPanel.updatePortNums(this._serverPort, this._serverWSPort);
			}
		});

		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(SETTINGS_SECTION_ID)) {
				this._server.updateConfigurations();
			}
		});
	}

	public createOrShowPreview(
		panel: vscode.WebviewPanel | undefined = undefined,
		file = '/'
	): void {
		const currentColumn = vscode.window.activeTextEditor?.viewColumn ?? 1;
		const column = currentColumn + 1;
		file = file.endsWith(".html") ? file : "/";
		// If we already have a panel, show it.
		if (this.currentPanel) {
			this.currentPanel.reveal(column, file);
			return;
		}

		if (!panel) {
			// Otherwise, create a new panel.
			panel = vscode.window.createWebviewPanel(
				BrowserPreview.viewType,
				INIT_PANEL_TITLE,
				column,
				getWebviewOptions(this._extensionUri)
			);
		}
		const serverOn = this.openServer();

		if (!serverOn) {
			return;
		}

		this.currentPanel = new BrowserPreview(
			panel,
			this._extensionUri,
			this._serverPort,
			this._serverWSPort,
			file
		);

		this.currentPanel.onDispose(() => {
			this.currentPanel = undefined;
			if (this._server.isRunning) {
				if (!this._globalState.get<boolean>(HAS_SET_CLOSE_PREVEW_BEHAVIOR)) {
					vscode.window
					.showInformationMessage(
						'You closed the embedded preview. Would you like to also close the server?',
						CLOSE_SERVER,
						DONT_CLOSE
					)
					.then((selection: vscode.MessageItem | undefined) => {
						if (selection) {
							if (selection === CLOSE_SERVER) {
								this.closeServer(true);
							}
							this.updateClosePreviewBehavior(selection == CLOSE_SERVER);
							SettingsSavedMessage();
						}
					});
					this._globalState.update(HAS_SET_CLOSE_PREVEW_BEHAVIOR, true);
				} else if (GetConfig(this._extensionUri).closeServerWithEmbeddedPreview) {
					this.closeServer(true);
				}
			}
		});
	}

	public showPreviewInBrowser(
		file = '/') {
		file = file.endsWith(".html") ? file : "/";
		const serverOn = this.openServer();

		if (!serverOn) {
			return;
		}

		const uri = vscode.Uri.parse(`http://${HOST}:${this._serverPort}${file}`);
		vscode.env.openExternal(uri);
	}

	public openServer(showMsgAlreadyOn = false): boolean {
		if (!this._server.isRunning) {
			return this._server.openServer(
				this._serverPort,
				this._serverWSPort,
				this._path
			);
		} else if (showMsgAlreadyOn) {
			vscode.window.showErrorMessage('Server already on');
		}
		return true;
	}

	public closeServer(showMsgAlreadyOff = false): void {
		if (this._server.isRunning) {
			this._server.closeServer();

			if (this.currentPanel) {
				this.currentPanel.close();
			}
		} else if (showMsgAlreadyOff) {
			vscode.window.showErrorMessage('Server already closed');
		}
	}

	dispose() {
		this._server.closeServer();
		super.dispose();
	}

	private updateClosePreviewBehavior(shouldClose:boolean) {
		// change in global settings
		vscode.workspace.getConfiguration(SETTINGS_SECTION_ID).update("closeServerWithEmbeddedPreview",shouldClose, true);
	}
}

export function getWebviewOptions(
	extensionUri: vscode.Uri
): vscode.WebviewOptions {
	return {
		// Enable javascript in the webview
		enableScripts: true,

		// And restrict the webview to only loading content from our extension's `media` directory.
		localResourceRoots: [
			vscode.Uri.joinPath(extensionUri, 'media'),
			vscode.Uri.joinPath(
				extensionUri,
				'node_modules',
				'vscode-codicons',
				'dist'
			),
		],
	};
}
