import { Disposable } from './utils/dispose';
import * as vscode from 'vscode';
import { ServerGrouping } from './serverGrouping';
import { PathUtil } from './utils/pathUtil';
import TelemetryReporter from 'vscode-extension-telemetry';
import { ConnectionManager } from './connectionInfo/connectionManager';
import { BrowserPreview } from './editorPreview/browserPreview';
import { SETTINGS_SECTION_ID, SettingUtil } from './utils/settingsUtil';
import * as nls from 'vscode-nls';
import {
	ServerStartedStatus,
	ServerTaskProvider,
} from './task/serverTaskProvider';
import { EndpointManager } from './infoManagers/endpointManager';
import { PreviewManager } from './editorPreview/previewManager';
import { Connection } from './connectionInfo/connection';
import { existsSync } from 'fs';
import { StatusBarNotifier } from './server/serverUtils/statusBarNotifier';

const localize = nls.loadMessageBundle();

export class ServerPreview extends Disposable {
	private _serverGroupings: Map<vscode.Uri | undefined, ServerGrouping>;
	private _connectionManager: ConnectionManager;
	private readonly _serverTaskProvider: ServerTaskProvider;
	private readonly _endpointManager: EndpointManager;
	private readonly _previewManager: PreviewManager;
	private readonly _statusBar: StatusBarNotifier;

	private hasServerRunning() {
		const isRunning = Array.from(this._serverGroupings.values()).filter(
			(group) => group.running
		);
		return isRunning.length !== 0;
	}
	private serverExpired(): void {
		// set a delay to server shutdown to avoid bad performance from re-opening/closing server.
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
	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _reporter: TelemetryReporter,
		private readonly _userDataDir: string | undefined
	) {
		super();
		this._serverGroupings = new Map<vscode.Uri, ServerGrouping>();
		this._connectionManager = this._register(
			new ConnectionManager(_extensionUri)
		);

		this._endpointManager = this._register(new EndpointManager());

		this._serverTaskProvider = new ServerTaskProvider(
			this._reporter,
			this._endpointManager,
			this._connectionManager
		);

		this._previewManager = this._register(
			new PreviewManager(
				this._extensionUri,
				this._reporter,
				this._connectionManager,
				this._endpointManager,
				this._serverTaskProvider,
				this.serverExpired
			)
		);

		this._register(
			vscode.tasks.registerTaskProvider(
				ServerTaskProvider.CustomBuildScriptType,
				this._serverTaskProvider
			)
		);

		this._register(
			this._serverTaskProvider.onRequestToOpenServer(() => {
				// open with non target
			})
		);

		this._register(
			this._serverTaskProvider.onRequestToCloseServer(() => {
				if (this._previewManager.previewActive) {
					this._serverTaskProvider.serverStop(false);
				} else {
					this.closeServers();
					this._serverTaskProvider.serverStop(true);
				}
			})
		);
		this._statusBar = this._register(new StatusBarNotifier(_extensionUri));
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
	public createNewGrouping(workspace: vscode.WorkspaceFolder | undefined) {
		let grouping = this._serverGroupings.get(workspace?.uri);
		if (!grouping) {
			const connection = this._createNewConnection(workspace);
			grouping = this._createHostedContentForWorkspace(workspace, connection);
			grouping.onClose(() => {
				this._serverGroupings.delete(workspace?.uri);
				if (this._serverGroupings.values.length == 0) {
					this._statusBar.ServerOff();
				}
			});
			this._serverGroupings.set(workspace?.uri, grouping);
			grouping.openServer();
		}

		return grouping;
	}

	public openPreview(
		internal: boolean,
		file: string,
		hc: ServerGrouping,
		isRelative: boolean,
		debug = false
	) {
		if (internal) {
			// for now, ignore debug or no debug for embedded preview
			hc.createOrShowEmbeddedPreview(undefined, file, isRelative);
		} else {
			hc.showPreviewInBrowser(file, isRelative, debug);
		}
	}

	public determineHCfromFile(
		file: vscode.Uri | string,
		fileStringRelative: boolean
	) {
		if (fileStringRelative) {
			this.getLooseFileHC();
		} else {
			let fileUri;
			if (typeof file == 'string') {
				fileUri = vscode.Uri.file(file);
			} else if (file instanceof vscode.Uri) {
				fileUri = file;
			} else {
				this.getLooseFileHC();
			}
			if (fileUri) {
				const workspace = vscode.workspace.getWorkspaceFolder(fileUri);
				if (workspace) {
					return this.getHCFromWorkspace(workspace);
				}
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
		hc?: ServerGrouping
	) {
		if (!file) {
			this.openNoTarget();
			return;
		}
		if (!hc) {
			if (workspace) {
				hc = this.getHCFromWorkspace(workspace);
			} else if (port) {
				this._serverGroupings.forEach((potentialHC, key) => {
					if (potentialHC.port === port) {
						hc = potentialHC;
						return;
					}
					hc = this.determineHCfromFile(file, fileStringRelative);
				});
			} else {
				hc = this.determineHCfromFile(file, fileStringRelative);
			}
		}
		if (hc) {
			this.handleOpenFile(internal, file, hc, fileStringRelative, debug);
		}
	}

	public openNoTarget() { // DOESNT DO THE RIGHT THING
		const workspaces = vscode.workspace.workspaceFolders;
		if (workspaces && workspaces.length > 0) {
			for (let i = 0; i < workspaces.length; i++) {
				const currWorkspace = workspaces[i];
				const manager = this._serverGroupings.get(currWorkspace.uri);
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

	public handleOpenFile(
		internal: boolean,
		file: vscode.Uri | string,
		hc: ServerGrouping,
		fileStringRelative = true,
		debug = false
	) {
		if (typeof file == 'string') {
			this.openPreview(internal, file, hc, fileStringRelative, debug);
			return;
		} else if (file instanceof vscode.Uri) {
			const filePath = file?.fsPath;
			if (filePath) {
				this.openPreview(internal, filePath, hc, false, debug);
				return;
			} else {
				const activeFilePath =
					vscode.window.activeTextEditor?.document.fileName;
				if (activeFilePath) {
					this.openPreview(internal, activeFilePath, hc, false, debug);
					return;
				}
			}
		} else {
			const activeFilePath = vscode.window.activeTextEditor?.document.fileName;
			if (activeFilePath) {
				this.openPreview(internal, activeFilePath, hc, false, debug);
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

	public getLooseFileHC() {
		return this.getHCFromWorkspace(undefined);
	}

	private _createHostedContentForWorkspace(
		workspace: vscode.WorkspaceFolder | undefined,
		connection: Connection
	) {
		return new ServerGrouping(
			this._extensionUri,
			this._reporter,
			connection,
			this._endpointManager,
			this._previewManager,
			this._statusBar,
			this._serverTaskProvider,
			this._userDataDir
		);
	}
	public closeServers() {
		this._connectionManager.connections.forEach((connection) => {
			connection.dispose();
		});

		this._serverGroupings.forEach((grouping) => {
			grouping.closeServer();
			grouping.dispose();
		});
	}
	public getHCFromWorkspace(workspace: vscode.WorkspaceFolder | undefined) {
		const connection = this._connectionManager.getConnection(workspace);
		if (connection) {
			const hcFromMap = this._serverGroupings.get(workspace?.uri);
			if (hcFromMap) {
				return hcFromMap;
			} else {
				const hc = this._createHostedContentForWorkspace(workspace, connection);
				this._serverGroupings.set(workspace?.uri, hc);
				return hc;
			}
		} else {
			return this.createNewGrouping(workspace);
		}
	}


	public openTargetAtFile(filePath:string) {
		this._serverGroupings.forEach((grouping) => {
			if (grouping.pathExistsRelativeToWorkspace(filePath)) {
				vscode.commands.executeCommand(
					`${SETTINGS_SECTION_ID}.start.preview.atFile`,
					filePath,
					true,
					grouping.workspace,
					undefined,
					grouping
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
