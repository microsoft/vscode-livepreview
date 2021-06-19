import * as vscode from 'vscode';
import { BrowserPreview } from './editorPreview/browserPreview';
import { Disposable } from './utils/dispose';
import { Server } from './server/serverManager';
import { INIT_PANEL_TITLE, HOST } from './utils/constants';
import { GetConfig, SETTINGS_SECTION_ID } from './utils/settingsUtil';
import {
	ServerStartedStatus,
	ServerTaskProvider,
} from './task/serverTaskProvider';
import { EncodeLooseFilePath, GetParentDir, GetWorkspacePath, isFileInjectable } from './utils/utils';

export interface serverMsg {
	method: string;
	url: string;
	status: number;
}
export class Manager extends Disposable {
	public currentPanel: BrowserPreview | undefined;
	private readonly _server: Server;
	private readonly _extensionUri: vscode.Uri;
	private _serverTaskProvider: ServerTaskProvider;
	private _serverPortNeedsUpdate = false;
	private _previewActive = false;
	private _currentTimeout: NodeJS.Timeout | undefined;

	// always leave off at previous port numbers to avoid retrying on many busy ports

	private get _serverPort() {
		return this._server.port;
	}
	private set _serverPort(portNum: number) {
		this._server.port = portNum;
	}
	private get _serverWSPort() {
		return this._server.ws_port;
	}
	private set _serverWSPort(portNum: number) {
		this._server.ws_port = portNum;
	}
	constructor(extensionUri: vscode.Uri) {
		super();
		this._extensionUri = extensionUri;
		this._server = this._register(new Server(extensionUri));
		this._serverPort = GetConfig(extensionUri).portNum;
		this._serverWSPort = GetConfig(extensionUri).portNum + 1;

		this._serverTaskProvider = new ServerTaskProvider();
		this._register(
			vscode.tasks.registerTaskProvider(
				ServerTaskProvider.CustomBuildScriptType,
				this._serverTaskProvider
			)
		);

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
				if (this._previewActive) {
					this._serverTaskProvider.serverStop(false);
				} else {
					this.closeServer();
					this._serverTaskProvider.serverStop(true);
				}
			})
		);

		this._server.onFullyConnected((e) => {
			if (e.port) {
				this._serverTaskProvider.serverStarted(
					e.port,
					ServerStartedStatus.JUST_STARTED
				);
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
				const newPortNum = GetConfig(this._extensionUri).portNum;
				if (newPortNum != this._serverPort) {
					if (!this._server.isRunning) {
						this._serverPort = GetConfig(this._extensionUri).portNum;
					} else {
						this._serverPortNeedsUpdate = true;
					}
				}
			}
		});
	}

	public createOrShowPreview(
		panel: vscode.WebviewPanel | undefined = undefined,
		file = '/', relative = true
	): void {
		

		if (!relative) {
			if (!this._server.canGetPath(file)) {
				// handle loose file
				file = EncodeLooseFilePath(file);
			} else {
				file = this._server.getFileRelativeToWorkspace(file);
			}
		}

		const column = vscode.ViewColumn.Beside;

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
				{
					...getWebviewOptions(this._extensionUri),
					...getWebviewPanelOptions(),
				}
			);
		}
		const serverOn = this.openServer();

		if (!serverOn) {
			return;
		}
		this.startPreview(panel, file);
	}

	public showPreviewInBrowser(file = '/', relative = true) {
		if (!this._serverTaskProvider.isRunning) {
			this._serverTaskProvider.extRunTask(
				GetConfig(this._extensionUri).browserPreviewLaunchServerLogging
			);
		}
		if (!relative) {
			if (!this._server.canGetPath(file)) {
				// handle loose file
				file = EncodeLooseFilePath(file);
			} else {
				file = this._server.getFileRelativeToWorkspace(file);
			}
		}
		const uri = vscode.Uri.parse(`http://${HOST}:${this._serverPort}${file}`);
		vscode.env.openExternal(uri);
	}

	public isPtyTerm(terminalName: string) {
		return this._serverTaskProvider.terminalName == terminalName;
	}

	public openServer(fromTask = false): boolean {
		
		if (!this._server.isRunning) {
			return this._server.openServer(this._serverPort);
		} else if (fromTask) {
			this._serverTaskProvider.serverStarted(
				this._serverPort,
				ServerStartedStatus.STARTED_BY_EMBEDDED_PREV
			);
		}

		return true;
	}

	// caller is reponsible for only calling this if nothing is using the server
	public closeServer(): void {
		if (this._server.isRunning) {
			this._server.closeServer();

			if (this.currentPanel) {
				this.currentPanel.close();
			}

			if (this._serverTaskProvider.isRunning) {
				this._serverTaskProvider.serverStop(true);
			}

			if (this._serverPortNeedsUpdate) {
				this._serverPort = GetConfig(this._extensionUri).portNum;
				this._serverPortNeedsUpdate = false;
			}
		}
	}

	private startPreview(panel: vscode.WebviewPanel, file: string) {

		if (this._currentTimeout) {
			clearTimeout(this._currentTimeout);
		}

		this.currentPanel = new BrowserPreview(
			panel,
			this._extensionUri,
			this._serverPort,
			this._serverWSPort,
			file
		);

		this._previewActive = true;

		this.currentPanel.onDispose(() => {
			this.currentPanel = undefined;
			const closeServerDelay = GetConfig(this._extensionUri).serverKeepAliveAfterEmbeddedPreviewClose;
			this._currentTimeout = setTimeout(() => {
				// set a delay to server shutdown to avoid bad performance from re-opening/closing server.
				if (this._server.isRunning && !this._serverTaskProvider.isRunning) {
					this.closeServer();
				}
				this._previewActive = false;
			}, Math.floor(closeServerDelay * 1000 * 60));

		});
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

export function getWebviewPanelOptions(): vscode.WebviewPanelOptions {
	return {
		retainContextWhenHidden: true,
	};
}
