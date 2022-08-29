import { Disposable } from './utils/dispose';
import * as vscode from 'vscode';
import { PathUtil } from './utils/pathUtil';
import TelemetryReporter from 'vscode-extension-telemetry';
import { ConnectionManager } from './connectionInfo/connectionManager';
import { BrowserPreview } from './editorPreview/browserPreview';
import {
	PreviewType,
	SETTINGS_SECTION_ID,
	SettingUtil,
} from './utils/settingsUtil';
import * as nls from 'vscode-nls';
import { ServerTaskProvider } from './task/serverTaskProvider';
import { EndpointManager } from './infoManagers/endpointManager';
import { PreviewManager } from './editorPreview/previewManager';
import { existsSync } from 'fs';
import { StatusBarNotifier } from './server/serverUtils/statusBarNotifier';
import { LIVE_PREVIEW_SERVER_ON } from './utils/constants';
import { ServerGrouping } from './server/serverGrouping';

const localize = nls.loadMessageBundle();

export interface IOpenFileOptions {
	relativeFileString?: boolean;
	workspace?: vscode.WorkspaceFolder;
	port?: number;
	manager?: ServerGrouping;
}

export interface IServerQuickPickItem extends vscode.QuickPickItem {
	accept(): void;
}

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
						this.closeAllServers();
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

		this._register(
			this._serverTaskProvider.onRequestOpenEditorToSide((uri) => {
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
			})
		);

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
					serverGrouping?.dispose();
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
			this._register(
				vscode.window.registerWebviewPanelSerializer(
					BrowserPreview.viewType,
					serializer
				)
			);
		}

		this._register(
			vscode.workspace.onDidChangeWorkspaceFolders((e) => {
				if (e.removed) {
					e.removed.forEach((workspace) => {
						const potentialGrouping = this._serverGroupings.get(
							workspace.uri.toString()
						);
						if (potentialGrouping) {
							potentialGrouping.dispose();
						}
					});
				}
				// known bug: transitioning between 1 and 2 workspaces: https://github.com/microsoft/vscode/issues/128138
			})
		);

		this._register(
			this._serverTaskProvider.onShouldLaunchPreview((e) =>
				this.openPreviewAtFile(e.file, e.options, e.previewType)
			)
		);

		this._register(
			this._previewManager.onShouldLaunchPreview((e) =>
				this.openPreviewAtFile(e.file, e.options, e.previewType)
			)
		);
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
	 * Show the picker to select a server to close
	 */
	public async showCloseServerPicker(): Promise<void> {
		const disposables: vscode.Disposable[] = [];

		const quickPick = vscode.window.createQuickPick<IServerQuickPickItem>();
		disposables.push(quickPick);

		quickPick.matchOnDescription = true;
		quickPick.placeholder = localize('selectPort', "Select the port that corresponds to the server that you want to close");
		quickPick.items = await this._getServerPicks();

		disposables.push(quickPick.onDidAccept(() => {
			const selectedItem = quickPick.selectedItems[0];
			selectedItem.accept();
			quickPick.hide();
			disposables.forEach(d => d.dispose());
		}));

		quickPick.show();
	}

	/**
	 * Close all servers
	 */
	public closeAllServers(): void {
		this._serverGroupings.forEach((serverGrouping) => {
			serverGrouping.dispose();
		});
	}

	public dispose(): void {
		this.closeAllServers();
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
				this.openPreviewAtFile(filePath, {
					relativeFileString: true,
					manager: serverGrouping,
					workspace: serverGrouping.workspace,
				});
				foundPath = true;
				return;
			}
		});

		if (foundPath) {
			return;
		}

		if (existsSync(filePath)) {
			this.openPreviewAtFile(filePath, { relativeFileString: false });
		} else {
			vscode.window.showWarningMessage(
				localize('fileDNE', "The file '{0}' does not exist.", filePath)
			);
			this.openPreviewAtFile('/', { relativeFileString: true });
		}
	}

	public async openPreviewAtFile(
		file?: vscode.Uri | string,
		options?: IOpenFileOptions,
		previewType?: string
	): Promise<void> {
		if (!previewType) {
			previewType = SettingUtil.GetPreviewType();
		}

		const internal = previewType === PreviewType.internalPreview;
		const debug = previewType === PreviewType.externalDebugPreview;

		return this.handleOpenFile(
			internal,
			file,
			options?.relativeFileString ?? false,
			debug,
			options?.workspace,
			options?.port,
			options?.manager
		);
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
					this.openPreviewAtFile('/', {
						relativeFileString: true,
						workspace: currWorkspace,
						manager: manager,
					});
					return;
				}
			}

			this.openPreviewAtFile('/', {
				relativeFileString: true,
				workspace: workspaces[0],
			});
		} else {
			this.openPreviewAtFile('/', { relativeFileString: false });
		}
	}

	private async _getServerPicks(): Promise<IServerQuickPickItem[]>  {

		const serverPicks: Array<IServerQuickPickItem> = [];

		const picks = await Promise.all(
			Array.from(this._serverGroupings.values()).map((grouping) => this._getServerPickFromGrouping(grouping)));

		picks.forEach(pick => {
			if (pick) {
				serverPicks.push(pick);
			}
		});

		if (picks.length > 0) {
			serverPicks.push({
				label: localize('allServers','All Servers'),
				accept: (): void =>
					this.closeAllServers()
			});
		}

		return serverPicks;
	}

	private _getServerPickFromGrouping(grouping: ServerGrouping): IServerQuickPickItem  | undefined{
		const connection = this._connectionManager.getConnection(grouping.workspace);
		if (!connection) {
			return;
		}
		return {
			label: `$(radio-tower) ${connection.httpPort}`,
			description: grouping.workspace?.name ?? localize('nonWorkspaceFiles','non-workspace files'),
			accept: ():void => {
				grouping.dispose();
			}
		};
	}
}
