import { Disposable } from './utils/dispose';
import * as vscode from 'vscode';
import { PathUtil } from './utils/pathUtil';
import TelemetryReporter from 'vscode-extension-telemetry';
import { ConnectionManager } from './connectionInfo/connectionManager';
import { BrowserPreview } from './editorPreview/browserPreview';
import { SETTINGS_SECTION_ID, SettingUtil } from './utils/settingsUtil';
import * as nls from 'vscode-nls';
import {
	ServerTaskProvider,
} from './task/serverTaskProvider';
import { EndpointManager } from './infoManagers/endpointManager';
import { PreviewManager } from './editorPreview/previewManager';
import { Connection } from './connectionInfo/connection';
import { existsSync } from 'fs';
import { StatusBarNotifier } from './server/serverUtils/statusBarNotifier';
import { LIVE_PREVIEW_SERVER_ON } from './utils/constants';
import { ServerManager } from './server/serverManager';

const localize = nls.loadMessageBundle();

class PanelSerializer extends Disposable implements vscode.WebviewPanelSerializer  {

	private readonly _onShouldRevive = this._register(
		new vscode.EventEmitter<{webviewPanel: vscode.WebviewPanel, state: any}>()
	);

	public readonly onShouldRevive = this._onShouldRevive.event;

	deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any): Thenable<void> {
		this._onShouldRevive.fire({webviewPanel,state});
		return Promise.resolve();
	}
}

export class ServerPreview extends Disposable {
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
				() => {if (
					this.hasServerRunning() &&
					!this._serverTaskProvider.isRunning &&
					vscode.workspace.workspaceFolders &&
					vscode.workspace.workspaceFolders?.length > 0 &&
					this._previewManager.runTaskWithExternalPreview
				) {
					this.closeServers();
				}}
			)
		);


		this._statusBar = this._register(new StatusBarNotifier(_extensionUri));


		this._serverTaskProvider = new ServerTaskProvider(
			this._reporter,
			this._endpointManager,
			this._connectionManager
		);

		this._register(
			vscode.tasks.registerTaskProvider(
				ServerTaskProvider.CustomBuildScriptType,
				this._serverTaskProvider
			)
		);

		this._serverTaskProvider.onRequestOpenEditorToSide((uri) => {
			if (this._previewManager.previewActive && this._previewManager.currentPanel) {
				const avoidColumn =
				this._previewManager.currentPanel.panel.viewColumn ?? vscode.ViewColumn.One;
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
					this._serverTaskProvider.serverStop(false);
				} else {
					const serverManager = this._serverManagers.get(workspace?.uri);
					serverManager?.closeServer();
					this._serverTaskProvider.serverStop(true);
				}
			})
		);


		const serializer = new PanelSerializer();
		this._register(serializer.onShouldRevive(e => {
			let relative = true;
		let file = e.state.currentAddress ?? '/';


		const workspace = PathUtil.PathExistsRelativeToAnyWorkspace(file);
		if (workspace) {
			const manager = this._getServerManagerFromWorkspace(workspace);
				if (!manager.pathExistsRelativeToWorkspace(file)) {
					const absFile = this._previewManager.decodeEndpoint(file);
					file = absFile ?? '/';
					relative = false;
				}

				e.webviewPanel.webview.options = this._previewManager.getWebviewOptions();
				manager.createOrShowEmbeddedPreview(e.webviewPanel, file, relative);

		} else {
			// root will not show anything, so cannot revive content. Dispose.
			e.webviewPanel.dispose();

		}
		}));
		if (vscode.window.registerWebviewPanelSerializer) {
			vscode.window.registerWebviewPanelSerializer(BrowserPreview.viewType, serializer);
		}
	}

	private _createNewConnection(workspace: vscode.WorkspaceFolder | undefined) {

		const serverPort = SettingUtil.GetConfig(this._extensionUri).portNumber;
		const serverWSPort = serverPort;
		const serverHost = SettingUtil.GetConfig(this._extensionUri).hostIP;
		return this._connectionManager.createAndAddNewConnection(
			serverPort,
			serverWSPort,
			serverHost,
			workspace
		);
	}
	private _getServerManagerFromWorkspace(workspace: vscode.WorkspaceFolder | undefined) {
		let serverManager = this._serverManagers.get(workspace?.uri);
		if (!serverManager) {
			const connection = this._createNewConnection(workspace);
			serverManager = this._createHostedContentForConnection(connection);
			serverManager.onClose(() => {
				this._serverManagers.delete(workspace?.uri);
				if (this._serverManagers.values.length == 0) {
					this._statusBar.ServerOff();
					vscode.commands.executeCommand('setContext', LIVE_PREVIEW_SERVER_ON, false);
				}
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

	private _getServerManagerFromFile(
		file: vscode.Uri | string,
		fileStringRelative: boolean
	) {
		if (fileStringRelative) {
			return this._getServerManagerFromWorkspace(undefined);
		} else {
			let fileUri;
			if (typeof file == 'string') {
				fileUri = vscode.Uri.file(file);
			} else if (file instanceof vscode.Uri) {
				fileUri = file;
			} else {
				return this._getServerManagerFromWorkspace(undefined);
			}
			if (fileUri) {
				const workspace = vscode.workspace.getWorkspaceFolder(fileUri);
				return this._getServerManagerFromWorkspace(workspace);
			}
		}
	}

	public handleOpenFileCaller(
		internal: boolean,
		file: vscode.Uri | string | undefined,
		fileStringRelative = true,
		debug = false,
		workspace?: vscode.WorkspaceFolder,
		port?: number,
		serverManager?: ServerManager
	) {
		if (!file) {
			this.openNoTarget();
			return;
		}
		if (!serverManager) {
			if (workspace) {
				serverManager = this._getServerManagerFromWorkspace(workspace);
			} else if (port) {
				this._serverManagers.forEach((potentialServerManager, key) => {
					if (potentialServerManager.port === port) {
						serverManager = potentialServerManager;
						return;
					}
					serverManager = this._getServerManagerFromFile(file, fileStringRelative);
				});
			} else {
				serverManager = this._getServerManagerFromFile(file, fileStringRelative);
			}
		}
		if (serverManager) {
			this._handleOpenFile(internal, file, serverManager, fileStringRelative, debug);
		}
	}

	public openNoTarget() { // DOESNT DO THE RIGHT THING
		const workspaces = vscode.workspace.workspaceFolders;
		if (workspaces && workspaces.length > 0) {
			for (let i = 0; i < workspaces.length; i++) {
				const currWorkspace = workspaces[i];
				const manager = this._serverManagers.get(currWorkspace.uri);
				if (manager) {
					vscode.commands.executeCommand(
						`${SETTINGS_SECTION_ID}.start.preview.atFile`,
						'/',
						true,
						currWorkspace,
						undefined,
						manager
					);
					return;
				}
			}

			vscode.commands.executeCommand(
				`${SETTINGS_SECTION_ID}.start.preview.atFile`,
				'/',
				true,
				workspaces[0],
				undefined
			);

		} else {
			vscode.commands.executeCommand(
				`${SETTINGS_SECTION_ID}.start.preview.atFile`,
				'/',
				false
			);
		}
	}

	private _handleOpenFile(
		internal: boolean,
		file: vscode.Uri | string,
		serverManager: ServerManager,
		fileStringRelative = true,
		debug = false
	) {
		if (typeof file == 'string') {
			this._openPreview(internal, file, serverManager, fileStringRelative, debug);
			return;
		} else if (file instanceof vscode.Uri) {
			const filePath = file?.fsPath;
			if (filePath) {
				this._openPreview(internal, filePath, serverManager, false, debug);
				return;
			} else {
				const activeFilePath =
					vscode.window.activeTextEditor?.document.fileName;
				if (activeFilePath) {
					this._openPreview(internal, activeFilePath, serverManager, false, debug);
					return;
				}
			}
		} else {
			const activeFilePath = vscode.window.activeTextEditor?.document.fileName;
			if (activeFilePath) {
				this._openPreview(internal, activeFilePath, serverManager, false, debug);
				return;
			}
		}

		vscode.window.showErrorMessage(
			localize(
				'notPartOfWorkspaceCannotPreview',
				'This file is not a part of the workspace where the server has started. Cannot preview.'
			)
		);
		return;
	}

	private _createHostedContentForConnection(
		connection: Connection
	) {
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
		this._connectionManager.connections.forEach((connection) => {
			connection.dispose();
		});

		this._serverManagers.forEach((serverManager) => {
			serverManager.closeServer();
			serverManager.dispose();
		});
	}

	public openTargetAtFile(filePath:string) {
		this._serverManagers.forEach((serverManager) => {
			if (serverManager.pathExistsRelativeToWorkspace(filePath)) {
				vscode.commands.executeCommand(
					`${SETTINGS_SECTION_ID}.start.preview.atFile`,
					filePath,
					true,
					serverManager.workspace,
					undefined,
					serverManager
				);
				return;
			}
		});
		if (existsSync(filePath)) {
			vscode.commands.executeCommand(
				`${SETTINGS_SECTION_ID}.start.preview.atFile`,
				filePath,
				false
			);
		} else {
			throw Error();
		}
	}
}
