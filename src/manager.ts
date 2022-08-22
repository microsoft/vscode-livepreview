import { Disposable } from './utils/dispose';
import * as vscode from 'vscode';
import { PathUtil } from './utils/pathUtil';
import TelemetryReporter from 'vscode-extension-telemetry';
import { ConnectionManager } from './connectionInfo/connectionManager';
import { BrowserPreview } from './editorPreview/browserPreview';
import { SETTINGS_SECTION_ID } from './utils/settingsUtil';
import * as nls from 'vscode-nls';
import { ServerTaskProvider } from './task/serverTaskProvider';
import { EndpointManager } from './infoManagers/endpointManager';
import { PreviewManager } from './editorPreview/previewManager';
import { Connection } from './connectionInfo/connection';
import { existsSync } from 'fs';
import { StatusBarNotifier } from './server/serverUtils/statusBarNotifier';
import { LIVE_PREVIEW_SERVER_ON } from './utils/constants';
import { ServerGrouping } from './server/serverGrouping';

const localize = nls.loadMessageBundle();

/**
 * This object re-serializes the webview after a reload
 */
class PanelSerializer
	extends Disposable
	implements vscode.WebviewPanelSerializer
{
	private readonly _onShouldRevive = this._register(
		new vscode.EventEmitter<{ webviewPanel: vscode.WebviewPanel; state: any }>()
	);

	public readonly onShouldRevive = this._onShouldRevive.event;

	deserializeWebviewPanel(
		webviewPanel: vscode.WebviewPanel,
		state: any
	): Thenable<void> {
		// fire event to parent, since all info needed to re-open a panel is in the parent
		this._onShouldRevive.fire({ webviewPanel, state });
		return Promise.resolve();
	}
}

/**
 * `Manager` is a singleton instance that managers all of the servers, the previews, connection info, etc.
 * It also facilitates opening files (sometimes by calling `PreviewManager`) and starting the associated servers.
 */
export class Manager extends Disposable {
	private _serverGroupings: Map<string | undefined, ServerGrouping>;
	private _connectionManager: ConnectionManager;
	private readonly _endpointManager: EndpointManager;
	private readonly _previewManager: PreviewManager;
	private readonly _statusBar: StatusBarNotifier;
	private readonly _serverTaskProvider: ServerTaskProvider;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _reporter: TelemetryReporter,
		private readonly _userDataDir: string | undefined
	) {
		super();
		this._serverGroupings = new Map<string, ServerGrouping>();
		this._connectionManager = this._register(new ConnectionManager());

		this._register(
			this._connectionManager.onConnected((e) => {
				this._statusBar.setServer(e.workspace?.uri, e.httpPort);
				vscode.commands.executeCommand(
					'setContext',
					LIVE_PREVIEW_SERVER_ON,
					true
				);
			})
		);

		this._endpointManager = this._register(new EndpointManager());

		this._previewManager = this._register(
			new PreviewManager(
				this._extensionUri,
				this._reporter,
				this._connectionManager,
				this._endpointManager,
				() => {
					if (
						this._hasServerRunning() &&
						!this._serverTaskProvider.isRunning &&
						vscode.workspace.workspaceFolders &&
						vscode.workspace.workspaceFolders?.length > 0 &&
						this._serverTaskProvider.runTaskWithExternalPreview
					) {
						this.closeServers();
					}
				}
			)
		);

		this._statusBar = this._register(new StatusBarNotifier());

		this._serverTaskProvider = this._register(
			new ServerTaskProvider(
				this._reporter,
				this._endpointManager,
				this._connectionManager
			)
		);

		this._register(
			vscode.tasks.registerTaskProvider(
				ServerTaskProvider.CustomBuildScriptType,
				this._serverTaskProvider
			)
		);

		this._register(this._serverTaskProvider.onRequestOpenEditorToSide((uri) => {
			if (
				this._previewManager.previewActive &&
				this._previewManager.currentPanel
			) {
				const avoidColumn =
					this._previewManager.currentPanel.panel.viewColumn ??
					vscode.ViewColumn.One;
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
		}));

		this._register(
			this._serverTaskProvider.onRequestToOpenServer(async (workspace) => {
				const serverGrouping = this._getServerGroupingFromWorkspace(workspace);
				// running this with `fromTask = true` will still inform the task if the server is already open
				await serverGrouping.openServer(true);
			})
		);

		this._register(
			this._serverTaskProvider.onRequestToCloseServer((workspace) => {
				if (this._previewManager.previewActive) {
					this._serverTaskProvider.serverStop(false, workspace);
				} else {
					const serverGrouping = this._serverGroupings.get(
						workspace?.uri.toString()
					);
					// closeServer will call `this._serverTaskProvider.serverStop(true, workspace);`
					serverGrouping?.closeServer();
				}
			})
		);

		const serializer = this._register(new PanelSerializer());

		this._register(
			serializer.onShouldRevive((e) => {
				let relative = false;
				let file = e.state.currentAddress ?? '/';

				let workspace = PathUtil.PathExistsRelativeToAnyWorkspace(file);
				if (workspace) {
					relative = true;
				} else {
					// path isn't relative to workspaces, try checking absolute path for workspace
					workspace = PathUtil.AbsPathInAnyWorkspace(file);
				}

				if (!workspace) {
					// no workspace; try to decode endpoint to fix file
					file = this._endpointManager.decodeLooseFileEndpoint(file);
					if (!file) {
						e.webviewPanel.dispose();
						return;
					}
				}

				// loose file workspace will be fetched if workspace is still undefined
				const grouping = this._getServerGroupingFromWorkspace(workspace);
				grouping.createOrShowEmbeddedPreview(e.webviewPanel, file, relative);
				e.webviewPanel.webview.options =
					this._previewManager.getWebviewOptions();
			})
		);

		if (vscode.window.registerWebviewPanelSerializer) {
			vscode.window.registerWebviewPanelSerializer(
				BrowserPreview.viewType,
				serializer
			);
		}

		vscode.workspace.onDidChangeWorkspaceFolders((e) => {
			if (e.removed) {
				e.removed.forEach(workspace => {
					const potentialGrouping = this._serverGroupings.get(workspace.uri.toString());
					if (potentialGrouping) {
						potentialGrouping.closeServer();
					}
				});
			}
			// known bug: transitioning between 1 and 2 workspaces: https://github.com/microsoft/vscode/issues/128138
		});
	}

	/**
	 * handles opening a file
	 * @param internal whether to launch an embedded preview
	 * @param file the uri or string filePath to use
	 * @param fileStringRelative whether the path is relative
	 * @param debug whether to launch in debug
	 * @param workspace the workspace to launch the file from
	 * @param port the port to derive the workspace from
	 * @param serverGrouping the serverGrouping that manages the server workspace
	 */
	public async handleOpenFile(
		internal: boolean,
		file: vscode.Uri | string | undefined,
		fileStringRelative: boolean,
		debug: boolean,
		workspace?: vscode.WorkspaceFolder,
		port?: number,
		serverGrouping?: ServerGrouping
	): Promise<void> {
		const fileInfo = this._getFileInfo(file, fileStringRelative);

		if (!serverGrouping) {
			if (workspace) {
				serverGrouping = this._getServerGroupingFromWorkspace(workspace);
			} else if (port) {
				this._serverGroupings.forEach((potentialServerGrouping, key) => {
					if (potentialServerGrouping.port === port) {
						serverGrouping = potentialServerGrouping;
						return;
					}
				});
			} else {
				if (fileInfo.isRelative) {
					workspace = PathUtil.PathExistsRelativeToAnyWorkspace(
						fileInfo.filePath
					);
				} else {
					workspace = PathUtil.AbsPathInAnyWorkspace(fileInfo.filePath);
				}
				serverGrouping = this._getServerGroupingFromWorkspace(workspace);
			}
		}

		if (!serverGrouping) {
			// last-resort: use loose workspace server.
			serverGrouping = this._getServerGroupingFromWorkspace(undefined);
		}

		return await this._openPreview(
			internal,
			fileInfo.filePath,
			serverGrouping,
			fileInfo.isRelative,
			debug
		);
	}

	/**
	 * Close all servers
	 */
	public closeServers(): void {
		this._serverGroupings.forEach((serverGrouping) => {
			serverGrouping.closeServer();
			serverGrouping.dispose();
		});
	}

	public dispose(): void {
		this.closeServers();
		super.dispose();
	}

	public closePanel(): void {
		this._previewManager.currentPanel?.close();
	}

	/**
	 * Using only a string path (unknown if relative or absolute), launch the preview or launch an error.
	 * This is usually used for when the user configures a setting for initial filepath
	 * @param filePath the string fsPath to use
	 */
	public openTargetAtFile(filePath: string): void {
		if (filePath === '') {
			this._openNoTarget();
			return;
		}
		let foundPath = false;
		this._serverGroupings.forEach((serverGrouping) => {
			if (serverGrouping.pathExistsRelativeToWorkspace(filePath)) {
				vscode.commands.executeCommand(
					`${SETTINGS_SECTION_ID}.start.preview.atFile`,
					filePath,
					{
						relativeFileString: true,
						workspaceFolder: serverGrouping.workspace,
						manager: serverGrouping,
					}
				);
				foundPath = true;
				return;
			}
		});

		if (foundPath) {
			return;
		}

		if (existsSync(filePath)) {
			vscode.commands.executeCommand(
				`${SETTINGS_SECTION_ID}.start.preview.atFile`,
				filePath,
				{ relativeFileString: false }
			);
		} else {
			vscode.window.showWarningMessage(
				localize('fileDNE', "The file '{0}' does not exist.", filePath)
			);
			vscode.commands.executeCommand(
				`${SETTINGS_SECTION_ID}.start.preview.atFile`,
				'/',
				{ relativeFileString: true }
			);
		}
	}

	/**
	 * Creates a serverGrouping and connection object for a workspace if it doesn't already have an existing one.
	 * Otherwise, return the existing serverGrouping.
	 * @param workspace
	 * @returns serverGrouping for this workspace (or, when `workspace == undefined`, the serverGrouping for the loose file workspace)
	 */
	private _getServerGroupingFromWorkspace(
		workspace: vscode.WorkspaceFolder | undefined
	): ServerGrouping {
		let serverGrouping = this._serverGroupings.get(workspace?.uri.toString());
		if (!serverGrouping) {
			const connection =
				this._connectionManager.createAndAddNewConnection(workspace);
			serverGrouping = this._register(
				new ServerGrouping(
					this._extensionUri,
					this._reporter,
					this._endpointManager,
					connection,
					this._serverTaskProvider,
					this._userDataDir
				)
			);
			this._register(
				serverGrouping.onClose(() => {
					if (
						this._previewManager.currentPanel &&
						this._previewManager.currentPanel.currentConnection === connection
					) {
						// close the preview if it is showing this server's content
						this._previewManager.currentPanel?.close();
					}

					this._statusBar.removeServer(workspace?.uri);
					this._serverGroupings.delete(workspace?.uri.toString());
					if (this._serverGroupings.size === 0) {
						this._statusBar.serverOff();
						vscode.commands.executeCommand(
							'setContext',
							LIVE_PREVIEW_SERVER_ON,
							false
						);
					}
					this._connectionManager.removeConnection(workspace);
				})
			);
			this._register(
				serverGrouping.onShouldLaunchEmbeddedPreview((e) =>
					this._previewManager.launchFileInEmbeddedPreview(
						e.file,
						e.relative,
						e.panel,
						e.connection
					)
				)
			);
			this._register(
				serverGrouping.onShouldLaunchExternalPreview((e) =>
					this._previewManager.launchFileInExternalBrowser(
						e.file,
						e.relative,
						e.debug,
						e.connection
					)
				)
			);
			this._serverGroupings.set(workspace?.uri.toString(), serverGrouping);
		}

		return serverGrouping;
	}

	private async _openPreview(
		internal: boolean,
		file: string,
		serverGrouping: ServerGrouping,
		isRelative: boolean,
		debug = false
	): Promise<void> {
		if (internal) {
			// for now, ignore debug or no debug for embedded preview
			serverGrouping.createOrShowEmbeddedPreview(undefined, file, isRelative);
		} else {
			await serverGrouping.showPreviewInBrowser(file, isRelative, debug);
		}
	}

	private _getFileInfo(
		file: vscode.Uri | string | undefined,
		fileStringRelative: boolean
	): { filePath: string; isRelative: boolean } {
		if (typeof file == 'string') {
			return { filePath: file, isRelative: fileStringRelative };
		} else if (file instanceof vscode.Uri) {
			let filePath = file?.fsPath;

			if (!filePath) {
				const activeFilePath =
					vscode.window.activeTextEditor?.document.fileName;
				if (activeFilePath) {
					filePath = activeFilePath;
					fileStringRelative = false;
				}
			}

			return { filePath, isRelative: fileStringRelative };
		} else {
			const activeFilePath = vscode.window.activeTextEditor?.document.fileName;
			if (activeFilePath) {
				return { filePath: activeFilePath, isRelative: false };
			}
		}

		return { filePath: '/', isRelative: fileStringRelative };
	}

	private _hasServerRunning(): boolean {
		const isRunning = Array.from(this._serverGroupings.values()).filter(
			(group) => group.running
		);
		return isRunning.length !== 0;
	}

	private _openNoTarget(): void {
		// opens index at first open server or opens a loose workspace at root
		const workspaces = vscode.workspace.workspaceFolders;
		if (workspaces && workspaces.length > 0) {
			for (let i = 0; i < workspaces.length; i++) {
				const currWorkspace = workspaces[i];
				const manager = this._serverGroupings.get(currWorkspace.uri.toString());
				if (manager) {
					vscode.commands.executeCommand(
						`${SETTINGS_SECTION_ID}.start.preview.atFile`,
						'/',

						{
							relativeFileString: true,
							workspaceFolder: currWorkspace,
							manager: manager,
						}
					);
					return;
				}
			}

			vscode.commands.executeCommand(
				`${SETTINGS_SECTION_ID}.start.preview.atFile`,
				'/',
				{ relativeFileString: true, workspaceFolder: workspaces[0] }
			);
		} else {
			vscode.commands.executeCommand(
				`${SETTINGS_SECTION_ID}.start.preview.atFile`,
				'/',
				{ relativeFileString: false }
			);
		}
	}
}
