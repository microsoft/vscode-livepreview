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
	SETTINGS_SECTION_ID,
	Settings,
} from './utils/constants';
import { GetConfig, UpdateSettings } from './utils/utils';
import { ServerTaskProvider } from './server/serverTask';

export interface serverMsg {
	method: string;
	url?: string;
	status: number;
}
export class Manager extends Disposable {
	public currentPanel: BrowserPreview | undefined;
	private readonly _server: Server;
	private readonly _extensionUri: vscode.Uri;
	private readonly _globalState;
	private _serverTaskProvider: ServerTaskProvider;

	// always leave off at previous port numbers to avoid retrying on many busy ports
	private _serverPort: number;
	private _serverWSPort: number;

	constructor(extensionUri: vscode.Uri, globalState: vscode.Memento) {
		super();
		this._extensionUri = extensionUri;
		this._globalState = globalState;
		this._serverPort = GetConfig(extensionUri).portNum;
		this._serverWSPort = GetConfig(extensionUri).portNum + 1;

		const currentWorkspace = vscode.workspace.workspaceFolders?.[0];
		this._server = this._register(
			new Server(extensionUri, currentWorkspace)
		);
		this._serverTaskProvider = new ServerTaskProvider(currentWorkspace?.uri.fsPath ?? "");
		this._register(vscode.tasks.registerTaskProvider(
			ServerTaskProvider.CustomBuildScriptType,
			this._serverTaskProvider
		));

		this._register(
			this._server.onNewReqProcessed((e) => {
				this._serverTaskProvider.sendServerInfoToTerminal(e);
			})
		);

		this._register(
			this._serverTaskProvider.onRequestToOpenServer(() => {
				this.openServer(true);
			})
		);

		this._register(
			this._serverTaskProvider.onRequestToCloseServer(() => {
				if (this.currentPanel) {
					this._serverTaskProvider.serverStop(false);
				} else {
					this.closeServer();
					this._serverTaskProvider.serverStop(true);
				}
			})
		);

		this._server.onFullyConnected((e) => {
			if (e.port) {
				this._serverTaskProvider.serverStarted(e.port, true);
			}
		});

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
		file = file.endsWith('.html') ? file : '/';
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
			if (this._server.isRunning && !this._serverTaskProvider.serverRunning) {
				this.closeServer();
			}
		});
	}

	public showPreviewInBrowser(file = '/') {
		file = file.endsWith('.html') ? file : '/';
		const serverOn = this.openServer();

		if (!serverOn) {
			return;
		}

		const uri = vscode.Uri.parse(`http://${HOST}:${this._serverPort}${file}`);
		vscode.env.openExternal(uri);
	}

	public openServer(fromTask = false): boolean {
		if (!this._server.isRunning) {
			return this._server.openServer(this._serverPort);
		} else if (fromTask) {
			this._serverTaskProvider.serverStarted(this._serverPort, false);
		}
		
		return true;
	}

	public closeServer(): void {
		if (this._server.isRunning) {
			this._server.closeServer();

			if (this.currentPanel) {
				this.currentPanel.close();
			}
		} 
	}

	dispose() {
		this._server.closeServer();
		super.dispose();
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
