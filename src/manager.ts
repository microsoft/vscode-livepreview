import * as vscode from 'vscode';
import { BrowserPreview } from './editorPreview/browserPreview';
import { Disposable } from './utils/dispose';
import { Server } from './server/serverManager';
import {
	INIT_PANEL_TITLE,
	HOST,
	DONT_SHOW_AGAIN,
	CONFIG_MULTIROOT,
} from './utils/constants';
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
import { EndpointManager } from './multiRootManagers/endpointManager';
import { WorkspaceManager } from './multiRootManagers/workspaceManager';

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
	private _notifiedAboutMultiRoot = false;
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
	public get workspace(): vscode.WorkspaceFolder | undefined {
		return this._workspaceManager.workspace;
	}
	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _reporter: TelemetryReporter
	) {
		super();
		this._endpointManager = this._register(new EndpointManager());
		this._workspaceManager = this._register(
			new WorkspaceManager(_extensionUri)
		);

		this._server = this._register(
			new Server(
				_extensionUri,
				this._endpointManager,
				_reporter,
				this._workspaceManager
			)
		);
		this._serverPort = SettingUtil.GetConfig(_extensionUri).portNumber;
		this._serverWSPort = SettingUtil.GetConfig(_extensionUri).portNumber + 1;

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
		if (this.workspace) {
			if (!this._serverTaskProvider.isRunning) {
				this._serverTaskProvider.extRunTask(
					SettingUtil.GetConfig(this._extensionUri)
						.browserPreviewLaunchServerLogging
				);
			}
		} else {
			// global tasks are currently not supported, just turn on server in this case.
			const serverOn = this.openServer();

			if (!serverOn) {
				return;
			}
		}
		file = this.transformNonRelativeFile(relative, file).replace(/\\/g, '/');

		const uri = vscode.Uri.parse(`http://${HOST}:${this._serverPort}${file}`);
		vscode.env.openExternal(uri);
	}

	public encodeEndpoint(location: string): string {
		return this._endpointManager.encodeLooseFileEndpoint(location);
	}

	public decodeEndpoint(location: string): string | undefined {
		return this._endpointManager.decodeLooseFileEndpoint(location);
	}

	public openServer(fromTask = false): boolean {
		if (!this._server.isRunning) {
			if (
				this._workspaceManager.numPaths > 1 &&
				this._workspaceManager.hasNullPathSetting()
			) {
				this.notifyMultiRootOpen();
			}
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
		return this._server.canGetPath(file);
	}

	public pathExistsRelativeToWorkspace(file: string) {
		return this._workspaceManager.pathExistsRelativeToWorkspace(file);
	}
	private transformNonRelativeFile(relative: boolean, file: string): string {
		if (!relative) {
			if (!this._server.canGetPath(file)) {
				this.notifyLooseFileOpen();
				file = this.encodeEndpoint(file);
			} else {
				file = this._server.getFileRelativeToWorkspace(file);
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

	private notifyMultiRootOpen() {
		if (
			!this._notifiedAboutMultiRoot &&
			SettingUtil.GetConfig(this._extensionUri).showWarningOnMultiRootOpen
		) {
			vscode.window
				.showWarningMessage(
					`There is no set default workspace to use in your multi-root workspace, so the first listed workspace (${this._workspaceManager.workspacePathname}) will be used.`,
					DONT_SHOW_AGAIN,
					CONFIG_MULTIROOT
				)
				.then((selection: vscode.MessageItem | undefined) => {
					if (selection == DONT_SHOW_AGAIN) {
						SettingUtil.UpdateSettings(
							Settings.showWarningOnMultiRootOpen,
							false
						);
					} else if (selection == CONFIG_MULTIROOT) {
						vscode.commands.executeCommand(
							`${SETTINGS_SECTION_ID}.config.selectWorkspace`
						);
					}
				});
		}
		this._notifiedAboutMultiRoot = true;
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
			this._workspaceManager
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
