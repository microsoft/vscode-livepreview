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
import { ServerManager } from './server/serverManager';
import * as fs from 'fs';

const localize = nls.loadMessageBundle();

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
		this._onShouldRevive.fire({ webviewPanel, state });
		return Promise.resolve();
	}
}

export class Manager extends Disposable {
	private _serverManagers: Map<vscode.Uri | undefined, ServerManager>;
	private _connectionManager: ConnectionManager;
	private readonly _endpointManager: EndpointManager;
	private readonly _previewManager: PreviewManager;
	private readonly _statusBar: StatusBarNotifier;
	private readonly _serverTaskProvider: ServerTaskProvider;

	private hasServerRunning() {
		const isRunning = Array.from(this._serverManagers.values()).filter(
			(group) => group.running
		);
		return isRunning.length !== 0;
	}

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _reporter: TelemetryReporter,
		private readonly _userDataDir: string | undefined
	) {
		super();
		this._serverManagers = new Map<vscode.Uri, ServerManager>();
		this._connectionManager = this._register(
			new ConnectionManager(_extensionUri)
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
						this.hasServerRunning() &&
						!this._serverTaskProvider.isRunning &&
						vscode.workspace.workspaceFolders &&
						vscode.workspace.workspaceFolders?.length > 0 &&
						this._previewManager.runTaskWithExternalPreview
					) {
						this.closeServers();
					}
				}
			)
		);

		this._statusBar = this._register(new StatusBarNotifier(_extensionUri));

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
		});
		this._register(
			this._serverTaskProvider.onRequestToOpenServer((workspace) => {
				const serverManager = this._getServerManagerFromWorkspace(workspace);
				serverManager.openServer(true);
			})
		);

		this._register(
			this._serverTaskProvider.onRequestToCloseServer((workspace) => {
				if (this._previewManager.previewActive) {
					this._serverTaskProvider.serverStop(false, workspace);
				} else {
					const serverManager = this._serverManagers.get(workspace?.uri);
					serverManager?.closeServer();
				}
			})
		);

		const serializer = new PanelSerializer();
		this._register(
			serializer.onShouldRevive((e) => {
				let relative = true;
				let file = e.state.currentAddress ?? '/';

				let workspace;

				if (PathUtil.AbsPathInAnyWorkspace(file)) {
					workspace = vscode.workspace.getWorkspaceFolder(file);
					relative = false;
				} else {
					workspace = PathUtil.PathExistsRelativeToAnyWorkspace(file);
				}

				if (workspace) {
					const manager = this._getServerManagerFromWorkspace(workspace);
					if (!manager.pathExistsRelativeToWorkspace(file)) {
						const absFile = this._endpointManager.decodeLooseFileEndpoint(file);
						file = absFile ?? '/';
						relative = false;
					}

					e.webviewPanel.webview.options =
						this._previewManager.getWebviewOptions();
					manager.createOrShowEmbeddedPreview(e.webviewPanel, file, relative);
				} else {
					const uri = vscode.Uri.parse(file);
					if (fs.existsSync(uri.fsPath)) {
						const manager = this._getServerManagerFromWorkspace(undefined);
						e.webviewPanel.webview.options =
							this._previewManager.getWebviewOptions();
						manager.createOrShowEmbeddedPreview(e.webviewPanel, file, relative);
					} else {
						// root will not show anything, so cannot revive content. Dispose.
						e.webviewPanel.dispose();
					}
				}
			})
		);
		if (vscode.window.registerWebviewPanelSerializer) {
			vscode.window.registerWebviewPanelSerializer(
				BrowserPreview.viewType,
				serializer
			);
		}
	}

	private _createNewConnection(workspace: vscode.WorkspaceFolder | undefined) {
		return this._connectionManager.createAndAddNewConnection(workspace);
	}
	private _getServerManagerFromWorkspace(
		workspace: vscode.WorkspaceFolder | undefined
	) {
		let serverManager = this._serverManagers.get(workspace?.uri);
		if (!serverManager) {
			const connection = this._createNewConnection(workspace);
			serverManager = this._createHostedContentForConnection(connection);
			serverManager.onClose(() => {
				this._serverManagers.delete(workspace?.uri);
				if (this._serverManagers.values.length == 0) {
					this._statusBar.ServerOff();
					vscode.commands.executeCommand(
						'setContext',
						LIVE_PREVIEW_SERVER_ON,
						false
					);
				}
				this._connectionManager.removeConnection(workspace);
			});
			this._serverManagers.set(workspace?.uri, serverManager);
		}

		return serverManager;
	}

	private _openPreview(
		internal: boolean,
		file: string,
		serverManager: ServerManager,
		isRelative: boolean,
		debug = false
	) {
		if (internal) {
			// for now, ignore debug or no debug for embedded preview
			serverManager.createOrShowEmbeddedPreview(undefined, file, isRelative);
		} else {
			serverManager.showPreviewInBrowser(file, isRelative, debug);
		}
	}

	private _getFileInfo(
		file: vscode.Uri | string | undefined,
		fileStringRelative: boolean
	): { filePath: string; isRelative: boolean } {
		if (typeof file == 'string') {
			return { filePath: file, isRelative: fileStringRelative };
		} else if (file instanceof vscode.Uri) {
			let filePath = file?.fsPath ?? file?.path;

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

	public handleOpenFile(
		internal: boolean,
		file: vscode.Uri | string | undefined,
		fileStringRelative: boolean,
		debug: boolean,
		workspace?: vscode.WorkspaceFolder,
		port?: number,
		serverManager?: ServerManager
	) {
		const fileInfo = this._getFileInfo(file, fileStringRelative);

		if (!serverManager) {
			if (workspace) {
				serverManager = this._getServerManagerFromWorkspace(workspace);
			} else if (port) {
				this._serverManagers.forEach((potentialServerManager, key) => {
					if (potentialServerManager.port === port) {
						serverManager = potentialServerManager;
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
				serverManager = this._getServerManagerFromWorkspace(workspace);
			}
		}

		if (!serverManager) {
			// last-resort: use loose workspace server.
			serverManager = this._getServerManagerFromWorkspace(undefined);
		}

		this._openPreview(
			internal,
			fileInfo.filePath,
			serverManager,
			fileInfo.isRelative,
			debug
		);
		return;
	}

	private _createHostedContentForConnection(connection: Connection) {
		return new ServerManager(
			this._extensionUri,
			this._reporter,
			this._endpointManager,
			connection,
			this._statusBar,
			this._previewManager,
			this._serverTaskProvider,
			this._userDataDir
		);
	}

	public closeServers() {
		this._serverManagers.forEach((serverManager) => {
			serverManager.closeServer();
			serverManager.dispose();
		});
	}

	public openTargetAtFile(filePath: string) {
		if (filePath === '') {
			this._openNoTarget();
			return;
		}
		this._serverManagers.forEach((serverManager) => {
			if (serverManager.pathExistsRelativeToWorkspace(filePath)) {
				vscode.commands.executeCommand(
					`${SETTINGS_SECTION_ID}.start.preview.atFile`,
					filePath,
					{
						relativeFileString: true,
						workspaceFolder: serverManager.workspace,
						manager: serverManager,
					}
				);
				return;
			}
		});
		if (existsSync(filePath)) {
			vscode.commands.executeCommand(
				`${SETTINGS_SECTION_ID}.start.preview.atFile`,
				filePath,
				{ relativeFileString: false }
			);
		} else {
			throw Error();
		}
	}

	private _openNoTarget() {
		const workspaces = vscode.workspace.workspaceFolders;
		if (workspaces && workspaces.length > 0) {
			for (let i = 0; i < workspaces.length; i++) {
				const currWorkspace = workspaces[i];
				const manager = this._serverManagers.get(currWorkspace.uri);
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
