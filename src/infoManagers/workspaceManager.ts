import { Disposable } from '../utils/dispose';
import {
	Settings,
	SETTINGS_SECTION_ID,
	SettingUtil,
} from '../utils/settingsUtil';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG_MULTIROOT, DONT_SHOW_AGAIN } from '../utils/constants';
import { PathUtil } from '../utils/pathUtil';

export interface workspaceChangeMsg {
	oldPath: string;
	newPath: string;
}

export class WorkspaceManager extends Disposable {
	// private _notifiedAboutMultiRoot = false;
	private _workspace: vscode.WorkspaceFolder | undefined;
	// private _settingsWorkspace = '';
	// public invalidPath = false;

	// private readonly _onWorkspaceChange = this._register(
	// 	new vscode.EventEmitter<workspaceChangeMsg>()
	// );
	// public readonly onWorkspaceChange = this._onWorkspaceChange.event;

	constructor() {
		super();
		if (this.numPaths == 1) {
			this._workspace = this.firstListedWorkspace;
		}
	}

	// public updateConfigurations(workspaceChange = false) {
	// 	const oldWorkspacePath = this.workspacePath;
	// 	const newPath = SettingUtil.GetConfig(this._extensionUri).serverWorkspace;
	// 	if (this.numPaths <= 1) {
	// 		this._workspace = this.firstListedWorkspace;
	// 	} else if (workspaceChange && !this.isAWorkspacePath(newPath)) {
	// 		this.warnAboutBadPath(newPath);
	// 		this._workspace = this.firstListedWorkspace;
	// 	} else if (this._settingsWorkspace != newPath) {
	// 		if (this.isAWorkspacePath(newPath)) {
	// 			this._workspace = this.getWorkspaceFromPath(newPath);
	// 		} else {
	// 			this.warnAboutBadPath(newPath);
	// 			this._workspace = this.firstListedWorkspace;
	// 		}
	// 	}
	// 	this._settingsWorkspace = newPath;
	// 	if (oldWorkspacePath != this.workspacePath) {
	// 		this._onWorkspaceChange.fire({
	// 			oldPath: oldWorkspacePath ?? '',
	// 			newPath: this.workspacePath ?? '',
	// 		});
	// 	}
	// }

	// private warnAboutBadPath(badPath: string) {
	// 	const optMsg = this.workspace
	// 		? `Using ${this.workspace?.name} instead.`
	// 		: ``;
	// 	const msg =
	// 		badPath == ''
	// 			? `Cannot use blank path for server root. ${optMsg}`
	// 			: `Cannot use workspace at "${badPath}" for server. ${optMsg}`;

	// 	vscode.window
	// 		.showWarningMessage(msg, CONFIG_MULTIROOT)
	// 		.then((selection: vscode.MessageItem | undefined) => {
	// 			if (selection == CONFIG_MULTIROOT) {
	// 				vscode.commands.executeCommand(
	// 					`${SETTINGS_SECTION_ID}.config.selectWorkspace`
	// 				);
	// 			}
	// 		});
	// }

	public get workspace(): vscode.WorkspaceFolder | undefined {
		return this._workspace;
	}

	public get workspacePath(): string | undefined {
		return this.workspace?.uri.fsPath;
	}

	public get workspacePathname(): string {
		return this.workspace?.name ?? '';
	}

	public get numPaths(): number {
		return vscode.workspace.workspaceFolders?.length ?? 0;
	}
	public canGetPath(path: string) {
		return this.workspacePath ? path.startsWith(this.workspacePath) : false;
	}

	public pathExistsRelativeToAnyWorkspace(file: string): boolean{
		if (file.startsWith("/")) {
			file = file.substr(1);
		}
		if (this.workspaces) {
			for (const i in this.workspaces) {
				if (PathUtil.PathBeginsWith(file, this.workspaces[i].uri.fsPath)) {
					return true;
				}
			}
		}
		return false;
	}
	public pathExistsRelativeToWorkspace(file: string) {
		const fullPath = path.join(this.workspacePath ?? '', file);
		return fs.existsSync(fullPath);
	}

	public isLooseFilePath(file: string) {
		const absPath = path.join(this.workspacePath ?? '', file);
		return !fs.existsSync(absPath);
	}

	// public hasNullPathSetting() {
	// 	return this._settingsWorkspace == '';
	// }

	public isAWorkspacePath(path: string) {
		const workspacePaths = vscode.workspace.workspaceFolders?.map(
			(e) => e.uri.fsPath
		);

		return workspacePaths?.includes(path);
	}
	public get firstListedWorkspace() {
		return vscode.workspace.workspaceFolders?.[0];
	}
	public get workspaces() {
		return vscode.workspace.workspaceFolders;
	}

	// private getWorkspaceFromPath(workspacePath: string) {
	// 	const workspaceFolders = vscode.workspace.workspaceFolders;
	// 	if (!workspaceFolders || workspaceFolders.length == 0) {
	// 		return undefined;
	// 	} else if (workspacePath == '') {
	// 		if (this.numPaths > 1) {
	// 			this.notifyMultiRootOpen();
	// 		}
	// 		return this.firstListedWorkspace;
	// 	}

	// 	if (workspaceFolders) {
	// 		for (let i = 0; i < workspaceFolders.length; i++) {
	// 			if (workspaceFolders[i].uri.fsPath == workspacePath) {
	// 				return workspaceFolders[i];
	// 			}
	// 		}
	// 	}

	// 	return this.firstListedWorkspace;
	// }

	// private notifyMultiRootOpen() {
	// 	if (
	// 		!this._notifiedAboutMultiRoot &&
	// 		SettingUtil.GetConfig(this._extensionUri).showWarningOnMultiRootOpen
	// 	) {
	// 		vscode.window
	// 			.showWarningMessage(
	// 				`There is no set default server workspace to use in your multi-root workspace, so the first workspace (${this.workspacePathname}) will be used.`,
	// 				DONT_SHOW_AGAIN,
	// 				CONFIG_MULTIROOT
	// 			)
	// 			.then((selection: vscode.MessageItem | undefined) => {
	// 				if (selection == DONT_SHOW_AGAIN) {
	// 					SettingUtil.UpdateSettings(
	// 						Settings.showWarningOnMultiRootOpen,
	// 						false
	// 					);
	// 				} else if (selection == CONFIG_MULTIROOT) {
	// 					vscode.commands.executeCommand(
	// 						`${SETTINGS_SECTION_ID}.config.selectWorkspace`
	// 					);
	// 				}
	// 			});
	// 	}
	// 	this._notifiedAboutMultiRoot = true;
	// }

	public getFileRelativeToWorkspace(path: string): string {
		const workspaceFolder = this.workspacePath;

		if (workspaceFolder && path.startsWith(workspaceFolder)) {
			return path.substr(workspaceFolder.length).replace(/\\/gi, '/');
		} else {
			return '';
		}
	}
}
