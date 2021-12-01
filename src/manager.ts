import * as vscode from 'vscode';
import { BrowserPreview } from './editorPreview/browserPreview';
import { Disposable } from './utils/dispose';
import { Server } from './server/serverManager';
import {
	INIT_PANEL_TITLE,
	DONT_SHOW_AGAIN,
	OUTPUT_CHANNEL_NAME,
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
import { EndpointManager } from './infoManagers/endpointManager';
import { WorkspaceManager } from './infoManagers/workspaceManager';
import { ConnectionManager } from './infoManagers/connectionManager';
import { PathUtil } from './utils/pathUtil';

/**
 * @description the server log item that is sent from the HTTP server to the server logging task.
 */
export interface serverMsg {
	method: string;
	url: string;
	status: number;
}

/**
 * @description the info for launching a preview, used after a server is launched.
 */
export interface launchInfo {
	external: boolean;
	file: string;
	relative: boolean;
	debug: boolean;
	panel?: vscode.WebviewPanel;
}
export class Manager extends Disposable {
	public currentPanel: BrowserPreview | undefined;

	private readonly _server: Server;
	private readonly _serverTaskProvider: ServerTaskProvider;
	private readonly _endpointManager: EndpointManager;
	private readonly _workspaceManager: WorkspaceManager;
	private readonly _connectionManager: ConnectionManager;
	private readonly _outputChannel: vscode.OutputChannel;
	private _pendingLaunchInfo: launchInfo | undefined;
	private _runTaskWithExternalPreview: boolean;
	private _previewActive = false;
	private _currentTimeout: NodeJS.Timeout | undefined;
	private _notifiedAboutLooseFiles = false;

	public get workspace(): vscode.WorkspaceFolder | undefined {
		return this._workspaceManager.workspace;
	}

	public get workspacePath(): string | undefined {
		return this._workspaceManager.workspacePath;
	}

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _reporter: TelemetryReporter,
		userDataDir: string | undefined
	) {
		super();

		this._outputChannel =
			vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);

		this._workspaceManager = this._register(new WorkspaceManager());
		this._endpointManager = this._register(
			new EndpointManager(this._workspaceManager)
		);
		const serverPort = SettingUtil.GetConfig(_extensionUri).portNumber;
		const serverWSPort = serverPort;
		const serverHost = SettingUtil.GetConfig(_extensionUri).hostIP;
		this._connectionManager = this._register(
			new ConnectionManager(serverPort, serverWSPort, serverHost)
		);

		this._server = this._register(
			new Server(
				_extensionUri,
				_reporter,
				this._endpointManager,
				this._workspaceManager,
				this._connectionManager,
				userDataDir
			)
		);

		this._serverTaskProvider = new ServerTaskProvider(
			this._reporter,
			this._endpointManager,
			this._workspaceManager,
			this._connectionManager
		);

		this._runTaskWithExternalPreview =
			SettingUtil.GetConfig(_extensionUri).runTaskWithExternalPreview;

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
			this._serverTaskProvider.serverStarted(
				e.httpURI,
				ServerStartedStatus.JUST_STARTED
			);

			if (this._pendingLaunchInfo) {
				if (this._pendingLaunchInfo.external) {
					this.launchFileInExternalBrowser(
						this._pendingLaunchInfo.file,
						this._pendingLaunchInfo.relative,
						this._pendingLaunchInfo.debug
					);
				} else {
					this.launchFileInEmbeddedPreview(
						this._pendingLaunchInfo.file,
						this._pendingLaunchInfo.relative,
						this._pendingLaunchInfo.panel
					);
				}
				this._pendingLaunchInfo = undefined;
			}
		});

		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(SETTINGS_SECTION_ID)) {
				this._server.updateConfigurations();
				this._connectionManager.pendingPort = SettingUtil.GetConfig(
					this._extensionUri
				).portNumber;
				this._connectionManager.pendingHost = SettingUtil.GetConfig(
					this._extensionUri
				).hostIP;
				this._runTaskWithExternalPreview = SettingUtil.GetConfig(
					this._extensionUri
				).runTaskWithExternalPreview;
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
			} else {
				vscode.commands.executeCommand('vscode.open', uri);
			}
		});
	}

	dispose() {
		this._server.closeServer();
	}

	/**
	 * Creates an (or shows the existing) embedded preview.
	 * @param {vscode.WebviewPanel} panel the panel, which may have been serialized from a previous session.
	 * @param {string} file the filesystem path to open in the preview.
	 * @param {boolean} relative whether the path was absolute or relative to the current workspace.
	 * @param {boolean} debug whether to run in debug mode (not implemented).
	 */
	public createOrShowEmbeddedPreview(
		panel: vscode.WebviewPanel | undefined = undefined,
		file = '/',
		relative = true,
		debug = false
	): void {
		if (!this._server.isRunning) {
			// set the pending launch info, which will trigger once the server starts in `launchFileInEmbeddedPreview`
			this._pendingLaunchInfo = {
				external: false,
				panel: panel,
				file: file,
				relative: relative,
				debug: debug,
			};
			this._serverTaskProvider.globalRunTask();
			this.openServer();
		} else {
			this.launchFileInEmbeddedPreview(file, relative, panel);
		}
	}

	/**
	 * Opens the preview in an external browser.
	 * @param {string} file the filesystem path to open in the preview.
	 * @param {boolean} relative whether the path was absolute or relative to the current workspace.
	 * @param {boolean} debug whether or not to run in debug mode.
	 */
	public showPreviewInBrowser(
		file = '/',
		relative = true,
		debug = false
	): void {
		if (!this._serverTaskProvider.isRunning) {
			if (!this._server.isRunning) {
				// set the pending launch info, which will trigger once the server starts in `launchFileInExternalPreview`
				this._pendingLaunchInfo = {
					external: true,
					file: file,
					relative: relative,
					debug: debug,
				};
			} else {
				this.launchFileInExternalBrowser(file, relative, debug);
			}
			if (
				this._workspaceManager.numPaths > 0 &&
				this._runTaskWithExternalPreview
			) {
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
			this.launchFileInExternalBrowser(file, relative, debug);
		}
	}

	/**
	 * Start the server.
	 * @param {boolean} fromTask whether the request is from a task; if so, it requires a reply to the terminal
	 * @returns {boolean} whether or not the server started successfully.
	 */
	public openServer(fromTask = false): boolean {
		if (!this._server.isRunning) {
			return this._server.openServer(this._serverPort);
		} else if (fromTask) {
			this._connectionManager.resolveExternalHTTPUri().then((uri) => {
				this._serverTaskProvider.serverStarted(
					uri,
					ServerStartedStatus.STARTED_BY_EMBEDDED_PREV
				);
			});
		}

		return true;
	}

	/**
	 * Stops the server.
	 * NOTE: the caller is reponsible for only calling this if nothing is using the server.
	 * @returns {boolean} whether or not the server stopped successfully.
	 */
	public closeServer(): boolean {
		if (this._server.isRunning) {
			this._server.closeServer();

			if (this.currentPanel) {
				this.currentPanel.close();
			}

			if (this._serverTaskProvider.isRunning) {
				this._serverTaskProvider.serverStop(true);
			}

			this._connectionManager.disconnected();
			return true;
		}
		return false;
	}

	/**
	 * @returns {WebviewOptions} the webview options to allow us to load the files we need in the webivew.
	 */
	public getWebviewOptions(): vscode.WebviewOptions {
		const options = {
			// Enable javascript in the webview
			enableScripts: true,

			localResourceRoots: [
				vscode.Uri.joinPath(this._extensionUri, 'media'),
				vscode.Uri.joinPath(
					this._extensionUri,
					'node_modules',
					'@vscode',
					'codicons',
					'dist'
				),
			],
		};
		return options;
	}

	/**
	 * @returns {vscode.WebviewPanelOptions} the webview panel options to allow it to always retain context.
	 */
	public getWebviewPanelOptions(): vscode.WebviewPanelOptions {
		return {
			retainContextWhenHidden: true,
		};
	}

	/**
	 * @param {string} file filesystem path to encode an endpoint for.
	 * @returns {string} the endpoint name to get this file from the server.
	 */
	public encodeEndpoint(file: string): string {
		return this._endpointManager.encodeLooseFileEndpoint(file);
	}

	/**
	 * @param {string} endpoint the endpoint to decode into a file path
	 * @returns {string | undefined} the file path served from the endpoint or undefined if the endpoint does not serve anything.
	 */
	public decodeEndpoint(endpoint: string): string | undefined {
		return this._endpointManager.decodeLooseFileEndpoint(endpoint);
	}

	/**
	 * Whether the file is in the current workspace.
	 * @param {string} file the path to test.
	 * @returns {boolean} whether it is in the server's workspace (will always return false if no workspace is open or in multi-workspace)
	 */
	public absPathInDefaultWorkspace(file: string): boolean {
		return this._workspaceManager.absPathInDefaultWorkspace(file);
	}

	/**
	 * @param {string} file the path to test.
	 * @returns {boolean} whether the path exists when placed relative to the workspae root.
	 */
	public pathExistsRelativeToWorkspace(file: string): boolean {
		return this._workspaceManager.pathExistsRelativeToDefaultWorkspace(file);
	}

	/**
	 * @param {string} file the path to use
	 * @returns {string} the path relative to default workspace. Will return empty string if `!absPathInDefaultWorkspace(file)`
	 */
	public getFileRelativeToDefaultWorkspace(file: string): string | undefined {
		return this._workspaceManager.getFileRelativeToDefaultWorkspace(file);
	}

	/**
	 * @returns {number} the port where the HTTP server is running.
	 */
	private get _serverPort(): number {
		return this._connectionManager.httpPort;
	}

	/**
	 * Actually launch the embedded browser preview (caller guarantees that the server has started.)
	 * @param {string} file the filesystem path to preview.
	 * @param {boolean} relative whether the path is relative.
	 * @param {vscode.WebviewPanel | undefined} panel the webview panel to reuse if defined.
	 */
	private launchFileInEmbeddedPreview(
		file: string,
		relative: boolean,
		panel: vscode.WebviewPanel | undefined
	) {
		file = this.transformNonRelativeFile(relative, file);
		// If we already have a panel, show it.
		if (this.currentPanel) {
			this.currentPanel.reveal(vscode.ViewColumn.Beside, file);
			return;
		}

		if (!panel) {
			// Otherwise, create a new panel.
			panel = vscode.window.createWebviewPanel(
				BrowserPreview.viewType,
				INIT_PANEL_TITLE,
				vscode.ViewColumn.Beside,
				{
					...this.getWebviewOptions(),
					...this.getWebviewPanelOptions(),
				}
			);
		}

		this.startEmbeddedPreview(panel, file);
	}

	/**
	 * Actually launch the external browser preview (caller guarantees that the server has started.)
	 * @param {string} file the filesystem path to preview.
	 * @param {boolean} relative whether the path is relative.
	 * @param {boolean} debug whether we are opening in a debug session.
	 */
	private launchFileInExternalBrowser(
		file: string,
		relative: boolean,
		debug: boolean
	) {
		const relFile = PathUtil.ConvertToUnixPath(
			this.transformNonRelativeFile(relative, file)
		);

		const url = `http://${this._connectionManager.host}:${this._serverPort}${relFile}`;
		if (debug) {
			vscode.commands.executeCommand('extension.js-debug.debugLink', url);
		} else {
			// will already resolve to local address
			vscode.env.openExternal(vscode.Uri.parse(url));
		}
	}

	/**
	 * Handles opening the embedded preview and setting up its listeners.
	 * After a browser preview is closed, the server will close if another browser preview has not opened after a period of time (configurable in settings)
	 * or if a task is not runnning. Because of this, a timer is triggerred upon webview (embedded preview) disposal/closing.
	 * @param {vscode.WebviewPanel} panel the panel to use to open the preview.
	 * @param {string} file the path to preview relative to index (should already be encoded).
	 */
	private startEmbeddedPreview(panel: vscode.WebviewPanel, file: string) {
		if (this._currentTimeout) {
			clearTimeout(this._currentTimeout);
		}
		this.currentPanel = this._register(
			new BrowserPreview(
				file,
				panel,
				this._extensionUri,
				this._reporter,
				this._workspaceManager,
				this._connectionManager,
				this._outputChannel
			)
		);

		this._previewActive = true;

		this._register(
			this.currentPanel.onDispose(() => {
				this.currentPanel = undefined;
				const closeServerDelay = SettingUtil.GetConfig(
					this._extensionUri
				).serverKeepAliveAfterEmbeddedPreviewClose;
				this._currentTimeout = setTimeout(() => {
					// set a delay to server shutdown to avoid bad performance from re-opening/closing server.
					if (
						this._server.isRunning &&
						!this._serverTaskProvider.isRunning &&
						this.workspace &&
						this._runTaskWithExternalPreview
					) {
						this.closeServer();
					}
					this._previewActive = false;
				}, Math.floor(closeServerDelay * 1000 * 60));
			})
		);
	}

	/**
	 * Transforms non-relative files into a path that can be used by the server.
	 * @param {boolean} relative whether the path is relative (if not relative, returns `file`).
	 * @param {string} file the path to potentially transform.
	 * @returns {string} the transformed path if the original `file` was realtive.
	 */
	private transformNonRelativeFile(relative: boolean, file: string): string {
		if (!relative) {
			if (!this._workspaceManager.absPathInDefaultWorkspace(file)) {
				if (!this._workspaceManager.absPathInAnyWorkspace(file)) {
					this.notifyLooseFileOpen();
				}
				file = this.encodeEndpoint(file);
			} else {
				file =
					this._workspaceManager.getFileRelativeToDefaultWorkspace(file) ?? '';
			}
		}
		return file;
	}

	/**
	 * @description notify the user that they are opening a file outside the current workspace(s).
	 */
	private notifyLooseFileOpen(): void {
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
}
