import * as vscode from 'vscode';
import { BrowserPreview } from './editorPreview/browserPreview';
import { Disposable } from './utils/dispose';
import { Server } from './server/serverManager';
import { INIT_PANEL_TITLE, HOST, DONT_SHOW_AGAIN } from './utils/constants';
import {
	ServerStartedStatus,
	ServerTaskProvider,
} from './task/serverTaskProvider';
import {
	Settings,
	SETTINGS_SECTION_ID,
	SettingUtil,
} from './utils/settingsUtil';
import TelemetryReporter from 'vscode-extension-telemetry';
import { EndpointManager } from './infoManagers/endpointManager';
import { WorkspaceManager } from './infoManagers/workspaceManager';
import { ConnectionManager } from './infoManagers/connectionManager';

export interface serverMsg {
	method: string;
	url: string;
	status: number;
}
export class Manager extends Disposable {
	public currentPanel: BrowserPreview | undefined;
	private readonly _server: Server;
	private _serverTaskProvider: ServerTaskProvider;
	private _serverPortNeedsUpdate = false;
	private _previewActive = false;
	private _currentTimeout: NodeJS.Timeout | undefined;
	private _notifiedAboutLooseFiles = false;
	private _endpointManager: EndpointManager;
	private _workspaceManager: WorkspaceManager;
	private _connectionManager: ConnectionManager;
	private _pendingExternalLaunchInfo = {
		valid: false,
		file: '',
		relative: false,
	};
	// always leave off at previous port numbers to avoid retrying on many busy ports

	private get _serverPort() {
		return this._connectionManager.httpPort;
	}
	private set _serverPort(portNum: number) {
		this._connectionManager.httpPort = portNum;
	}
	private get _serverWSPort() {
		return this._connectionManager.wsPort;
	}
	private set _serverWSPort(portNum: number) {
		this._connectionManager.wsPort = portNum;
	}
	public get workspace(): vscode.WorkspaceFolder | undefined {
		return this._workspaceManager.workspace;
	}

	public get workspacePath(): string | undefined {
		return this._workspaceManager.workspacePath;
	}
	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _reporter: TelemetryReporter
	) {
		super();
		this._endpointManager = this._register(new EndpointManager());
		const serverPort = SettingUtil.GetConfig(_extensionUri).portNumber;
		const serverWSPort = serverPort + 1;
		this._connectionManager = this._register(
			new ConnectionManager(serverPort, serverWSPort)
		);
		this._workspaceManager = this._register(
			new WorkspaceManager(_extensionUri)
		);

		this._server = this._register(
			new Server(
				_extensionUri,
				this._endpointManager,
				_reporter,
				this._workspaceManager,
				this._connectionManager
			)
		);

		this._serverTaskProvider = new ServerTaskProvider(
			this._reporter,
			this._endpointManager,
			this._workspaceManager
		);
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

		this._connectionManager.onConnected((e) => {
			if (e.port) {
				this._serverTaskProvider.serverStarted(
					e.port,
					ServerStartedStatus.JUST_STARTED
				);
			}
			if (this.currentPanel) {
				this._serverPort = e.port ?? this._serverPort;
				this._serverWSPort = e.ws_port ?? this._serverWSPort;
				this.currentPanel.updatePortNums(this._serverPort, this._serverWSPort);
			}

			if (this._pendingExternalLaunchInfo.valid) {
				this.launchFileInExternalBrowser(
					this._pendingExternalLaunchInfo.file,
					this._pendingExternalLaunchInfo.relative
				);
				this._pendingExternalLaunchInfo.valid = false;
			}
		});

		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(SETTINGS_SECTION_ID)) {
				this._server.updateConfigurations();
				this._workspaceManager.updateConfigurations();
				const newPortNum = SettingUtil.GetConfig(this._extensionUri).portNumber;
				if (newPortNum != this._serverPort) {
					if (!this._server.isRunning) {
						this._serverPort = SettingUtil.GetConfig(
							this._extensionUri
						).portNumber;
					} else {
						this._serverPortNeedsUpdate = true;
					}
				}
			}
		});

		this._serverTaskProvider.onRequestOpenEditorToSide((uri) => {
			if (this._previewActive && this.currentPanel) {
				const avoidColumn =
					this.currentPanel.panel.viewColumn ?? vscode.ViewColumn.One;
				const column: vscode.ViewColumn =
					avoidColumn == vscode.ViewColumn.One
						? avoidColumn + 1
						: avoidColumn - 1;
				vscode.commands.executeCommand('vscode.open', uri, {
					viewColumn: column,
				});
			}
		});
	}

	public createOrShowEmbeddedPreview(
		panel: vscode.WebviewPanel | undefined = undefined,
		file = '/',
		relative = true
	): void {
		file = this.transformNonRelativeFile(relative, file);

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
		this.startEmbeddedPreview(panel, file);
	}

	public showPreviewInBrowser(file = '/', relative = true) {
		if (!this._serverTaskProvider.isRunning) {
			if (!this._server.isRunning) {
				this._pendingExternalLaunchInfo = {
					valid: true,
					file: file,
					relative: relative,
				};
			} else {
				this.launchFileInExternalBrowser(file, relative);
			}
			if (this.workspace) {
				this._serverTaskProvider.extRunTask(
					SettingUtil.GetConfig(this._extensionUri)
						.browserPreviewLaunchServerLogging
				);
			} else {
				// global tasks are currently not supported, just turn on server in this case.
				const serverOn = this.openServer();

				if (!serverOn) {
					return;
				}
			}
		} else {
			this.launchFileInExternalBrowser(file, relative);
		}
	}

	public encodeEndpoint(location: string): string {
		return this._endpointManager.encodeLooseFileEndpoint(location);
	}

	public decodeEndpoint(location: string): string | undefined {
		return this._endpointManager.decodeLooseFileEndpoint(location);
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
	public closeServer(): boolean {
		if (this._server.isRunning) {
			this._server.closeServer();

			if (this.currentPanel) {
				this.currentPanel.close();
			}

			if (this._serverTaskProvider.isRunning) {
				this._serverTaskProvider.serverStop(true);
			}

			if (this._serverPortNeedsUpdate) {
				this._serverPort = SettingUtil.GetConfig(this._extensionUri).portNumber;
				this._serverPortNeedsUpdate = false;
			}
			return true;
		}
		return false;
	}

	public inServerWorkspace(file: string) {
		return this._workspaceManager.canGetPath(file);
	}

	public pathExistsRelativeToWorkspace(file: string) {
		return this._workspaceManager.pathExistsRelativeToWorkspace(file);
	}

	private launchFileInExternalBrowser(file: string, relative: boolean) {
		const relFile = this.transformNonRelativeFile(relative, file).replace(
			/\\/g,
			'/'
		);
		const uri = vscode.Uri.parse(
			`http://${HOST}:${this._serverPort}${relFile}`
		);
		vscode.env.openExternal(uri);
	}
	private transformNonRelativeFile(relative: boolean, file: string): string {
		if (!relative) {
			if (!this._workspaceManager.canGetPath(file)) {
				this.notifyLooseFileOpen();
				file = this.encodeEndpoint(file);
			} else {
				file = this._workspaceManager.getFileRelativeToWorkspace(file);
			}
		}
		return file;
	}

	private notifyLooseFileOpen() {
		/* __GDPR__
			"preview.fileOutOfWorkspace" : {}
		*/
		this._reporter.sendTelemetryEvent('preview.fileOutOfWorkspace');
		if (
			!this._notifiedAboutLooseFiles &&
			SettingUtil.GetConfig(this._extensionUri).notifyOnOpenLooseFile
		) {
			vscode.window
				.showWarningMessage(
					'Previewing a file that is not a child of the server root. To see fully correct relative file links, please open a workspace at the project root.',
					DONT_SHOW_AGAIN
				)
				.then((selection: vscode.MessageItem | undefined) => {
					if (selection == DONT_SHOW_AGAIN) {
						SettingUtil.UpdateSettings(Settings.notifyOnOpenLooseFile, false);
					}
				});
		}
		this._notifiedAboutLooseFiles = true;
	}

	private startEmbeddedPreview(panel: vscode.WebviewPanel, file: string) {
		if (this._currentTimeout) {
			clearTimeout(this._currentTimeout);
		}
		this.currentPanel = new BrowserPreview(
			panel,
			this._extensionUri,
			this._serverPort,
			this._serverWSPort,
			file,
			this._reporter,
			this._workspaceManager,
			this._endpointManager
		);

		this._previewActive = true;

		this.currentPanel.onDispose(() => {
			this.currentPanel = undefined;
			const closeServerDelay = SettingUtil.GetConfig(
				this._extensionUri
			).serverKeepAliveAfterEmbeddedPreviewClose;
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
		this.currentPanel?.dispose();
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
