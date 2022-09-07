import { Disposable } from './utils/dispose';
import * as vscode from 'vscode';
import { PathUtil } from './utils/pathUtil';
import TelemetryReporter from 'vscode-extension-telemetry';
import { ConnectionManager } from './connectionInfo/connectionManager';
import { BrowserPreview } from './editorPreview/browserPreview';
import { PreviewType, SettingUtil } from './utils/settingsUtil';
import * as nls from 'vscode-nls';
import { ServerTaskProvider } from './task/serverTaskProvider';
import { EndpointManager } from './infoManagers/endpointManager';
import { PreviewManager } from './editorPreview/previewManager';
import { existsSync } from 'fs';
import { StatusBarNotifier } from './server/serverUtils/statusBarNotifier';
import { LIVE_PREVIEW_SERVER_ON } from './utils/constants';
import { ServerGrouping } from './server/serverGrouping';
import { UpdateListener } from './updateListener';
import { URL } from 'url';

const localize = nls.loadMessageBundle();

export interface IOpenFileOptions {
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
	private readonly _updateListener: UpdateListener;
	private readonly _pendingServerWorkspaces: Set<string | undefined>;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _reporter: TelemetryReporter,
		_userDataDir: string | undefined
	) {
		super();
		this._serverGroupings = new Map<string | undefined, ServerGrouping>();
		this._pendingServerWorkspaces = new Set<string | undefined>();
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
			this._serverTaskProvider.onShouldLaunchPreview((e) => {
				if (e.uri && e.uri.scheme !== 'file') {
					this.openPreviewAtLink(e.uri, e.previewType);
				} else {
					this.openPreviewAtFileUri(e.uri, e.options, e.previewType);
				}
			})
		);

		this._register(
			this._previewManager.onShouldLaunchPreview((e) => {
				if (e.uri && e.uri.scheme !== 'file') {
					this.openPreviewAtLink(e.uri, e.previewType);
				} else {
					this.openPreviewAtFileUri(e.uri, e.options, e.previewType);
				}
			})
		);

		this._updateListener = this._register(new UpdateListener(_userDataDir));
		this._register(
			this._updateListener.shouldRefreshPreviews(() => this._refreshBrowsers())
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
		debug: boolean,
		file: vscode.Uri,
		workspace?: vscode.WorkspaceFolder,
		port?: number,
		serverGrouping?: ServerGrouping
	): Promise<void> {
		if (file.scheme !== 'file') {
			console.error('Tried to open a non-file URI with file opener');
		}
		if (!serverGrouping) {
			if (workspace) {
				serverGrouping = this._getServerGroupingFromWorkspace(workspace);
			} else if (port) {
				this._serverGroupings.forEach((potentialServerGrouping) => {
					if (potentialServerGrouping.port === port) {
						serverGrouping = potentialServerGrouping;
						return;
					}
				});
			} else {
				workspace = vscode.workspace.getWorkspaceFolder(file);
				serverGrouping = this._getServerGroupingFromWorkspace(workspace);
			}
		}

		if (!serverGrouping) {
			// last-resort: use loose workspace server.
			serverGrouping = this._getServerGroupingFromWorkspace(undefined);
		}

		return this._openPreview(internal, serverGrouping, file, debug);
	}

	/**
	 * Show the picker to select a server to close
	 */
	public async showCloseServerPicker(): Promise<void> {
		const disposables: vscode.Disposable[] = [];

		const quickPick = vscode.window.createQuickPick<IServerQuickPickItem>();
		disposables.push(quickPick);

		quickPick.matchOnDescription = true;
		quickPick.placeholder = localize(
			'selectPort',
			'Select the port that corresponds to the server that you want to stop'
		);
		quickPick.items = await this._getServerPicks();

		disposables.push(
			quickPick.onDidAccept(() => {
				const selectedItem = quickPick.selectedItems[0];
				selectedItem.accept();
				quickPick.hide();
				disposables.forEach((d) => d.dispose());
			})
		);

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
	public openPreviewAtFileString(filePath: string): void {
		if (filePath === '') {
			this._openPreviewWithNoTarget();
			return;
		}
		// let foundPath = false;
		const workspace = PathUtil.PathExistsRelativeToAnyWorkspace(filePath);
		if (workspace) {
			const file = vscode.Uri.joinPath(workspace.uri, filePath);
			this.openPreviewAtFileUri(file, {
				workspace: workspace,
			});
		}

		if (existsSync(filePath)) {
			const file = vscode.Uri.file(filePath);
			this.openPreviewAtFileUri(file);
		} else {
			vscode.window.showWarningMessage(
				localize('fileDNE', "The file '{0}' does not exist.", filePath)
			);
			this.openPreviewAtFileUri(undefined);
		}
	}

	/**
	 * Runs task for workspace from within extension. Must have at least one workspace open.
	 * @param file optional file to use to find the workspace to run the task out of.
	 * @returns
	 */
	public async runTaskForFile(file?: vscode.Uri): Promise<void> {
		if (!file) {
			file = vscode.window.activeTextEditor?.document.uri;
		}

		let workspace;
		if (file) {
			workspace = vscode.workspace.getWorkspaceFolder(file);
		} else if (
			vscode.workspace.workspaceFolders &&
			vscode.workspace.workspaceFolders?.length > 0
		) {
			if (this._serverGroupings.size > 0) {
				const matchGrouping = Array.from(this._serverGroupings.values()).find(
					(grouping) => grouping.workspace && grouping.isRunning
				);
				workspace =
					matchGrouping?.workspace ?? vscode.workspace.workspaceFolders[0];
			} else {
				workspace = vscode.workspace.workspaceFolders[0];
			}
		}

		if (!workspace) {
			return; // fails preconditions of being in a workspace
		}

		return await this._serverTaskProvider.extRunTask(workspace);
	}

	/**
	* Opens a preview at an internal link that has the format <scheme>://<host>:<port>/<path>
	* @param link
	* @param previewType
	*/
	public async openPreviewAtLink(
		link: vscode.Uri,
		previewType?: string
	): Promise<void> {
		const debug = previewType === PreviewType.externalDebugPreview;
		const internal = this._isInternalPreview(previewType);
		try {
			if (link.scheme !== 'https' && link.scheme !== 'http') {
				console.error(`${link.scheme} does not correspond to a link URI`);
				throw Error;
			}
			const pathStr = `${link.scheme}://${link.authority}`;
			const url = new URL(pathStr);
			const port = parseInt(url.port);
			const connection = this._connectionManager.getConnectionFromPort(port);
			if (!connection) {
				console.error(`There is no server from Live Preview on port ${port}.`);
				throw Error;
			}

			const serverGrouping = this._getServerGroupingFromWorkspace(
				connection.workspace
			);
			if (!connection.workspace) {
				return this._openPreview(
					internal,
					serverGrouping,
					vscode.Uri.file(link.path),
					debug
				);
			}

			const file = vscode.Uri.joinPath(connection.workspace.uri, link.path);
			this._openPreview(internal, serverGrouping, file, debug);
		} catch (e) {
			vscode.window.showErrorMessage(
				localize('badURL', 'Tried to open preview on invalid URI')
			);
		}
	}

	public async openPreviewAtFileUri(
		file?: vscode.Uri,
		options?: IOpenFileOptions,
		previewType?: string
	): Promise<void> {
		let fileUri: vscode.Uri;
		if (!file) {
			const activeFile = vscode.window.activeTextEditor?.document.uri;
			if (activeFile) {
				fileUri = activeFile;
			} else {
				return this._openPreviewWithNoTarget();
			}
		} else {
			fileUri = file;
		}
		if (!previewType) {
			previewType = SettingUtil.GetPreviewType();
		}

		const internal = previewType === PreviewType.internalPreview;
		const debug = previewType === PreviewType.externalDebugPreview;

		return this.handleOpenFile(
			internal,
			debug,
			fileUri,
			options?.workspace,
			options?.port,
			options?.manager
		);
	}

	private _refreshBrowsers(): void {
		Array.from(this._serverGroupings.values()).forEach((grouping) => {
			grouping.refresh();
		});
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

			this._register(connection.onConnected(()=> {
				this._pendingServerWorkspaces.delete(workspace?.uri.toString());
			}));
			serverGrouping = this._register(
				new ServerGrouping(
					this._extensionUri,
					this._reporter,
					this._endpointManager,
					connection,
					this._serverTaskProvider,
					this._pendingServerWorkspaces
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
						e.panel,
						e.connection,
						e.uri
					)
				)
			);
			this._register(
				serverGrouping.onShouldLaunchExternalPreview((e) =>
					this._previewManager.launchFileInExternalBrowser(
						e.debug,
						e.connection,
						e.uri
					)
				)
			);
			this._serverGroupings.set(workspace?.uri.toString(), serverGrouping);
		}

		return serverGrouping;
	}

	private async _openPreview(
		internal: boolean,
		serverGrouping: ServerGrouping,
		file?: vscode.Uri,
		debug = false
	): Promise<void> {
		if (internal) {
			// for now, ignore debug or no debug for embedded preview
			await serverGrouping.createOrShowEmbeddedPreview(undefined, file);
		} else {
			await serverGrouping.showPreviewInBrowser(debug, file);
		}
	}

	private _hasServerRunning(): boolean {
		const isRunning = Array.from(this._serverGroupings.values()).filter(
			(group) => group.running
		);
		return isRunning.length !== 0;
	}

	private _isInternalPreview(previewType?: string): boolean {
		if (!previewType) {
			previewType = SettingUtil.GetPreviewType();
		}
		return previewType === PreviewType.internalPreview;
	}
	private _openPreviewWithNoTarget(): void {
		// opens index at first open server or opens a loose workspace at root

		const internal = this._isInternalPreview();
		const workspaces = vscode.workspace.workspaceFolders;
		if (workspaces && workspaces.length > 0) {
			for (let i = 0; i < workspaces.length; i++) {
				const currWorkspace = workspaces[i];
				const manager = this._serverGroupings.get(currWorkspace.uri.toString());
				if (manager) {
					this.openPreviewAtFileUri(undefined, {
						workspace: currWorkspace,
						manager: manager,
					});
					return;
				}
			}

			const grouping = this._getServerGroupingFromWorkspace(workspaces[0]);
			this._openPreview(internal, grouping, undefined);
		} else {
			const grouping = this._getServerGroupingFromWorkspace(undefined);
			this._openPreview(internal, grouping, undefined);
		}
	}

	private async _getServerPicks(): Promise<IServerQuickPickItem[]> {
		const serverPicks: Array<IServerQuickPickItem> = [];

		const picks = await Promise.all(
			Array.from(this._serverGroupings.values()).map((grouping) =>
				this._getServerPickFromGrouping(grouping)
			)
		);

		picks.forEach((pick) => {
			if (pick) {
				serverPicks.push(pick);
			}
		});

		if (picks.length > 0) {
			serverPicks.push({
				label: localize('allServers', 'All Servers'),
				accept: (): void => this.closeAllServers(),
			});
		}

		return serverPicks;
	}

	private _getServerPickFromGrouping(
		grouping: ServerGrouping
	): IServerQuickPickItem | undefined {
		const connection = this._connectionManager.getConnection(
			grouping.workspace
		);
		if (!connection) {
			return;
		}
		return {
			label: `$(radio-tower) ${connection.httpPort}`,
			description:
				grouping.workspace?.name ??
				localize('nonWorkspaceFiles', 'non-workspace files'),
			accept: (): void => {
				grouping.dispose();
			},
		};
	}
}
