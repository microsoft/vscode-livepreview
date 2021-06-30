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

export interface workspaceChangeMsg {
	oldPath: string;
	newPath: string;
}

export class WorkspaceManager extends Disposable {
	private _notifiedAboutMultiRoot = false;
	private _workspace: vscode.WorkspaceFolder | undefined;
	private _settingsWorkspace = '';
	public invalidPath = false;

	private readonly _onWorkspaceChange = this._register(
		new vscode.EventEmitter<workspaceChangeMsg>()
	);
	public readonly onWorkspaceChange = this._onWorkspaceChange.event;

	constructor(private readonly _extensionUri: vscode.Uri) {
		super();
	}

	public updateConfigurations() {
		const newPath = SettingUtil.GetConfig(this._extensionUri).serverWorkspace;
		if (this.isAWorkspacePath(newPath)) {
			const oldWorkspacePath = this.workspacePath;
			if (this.numPaths > 1) {
				this._settingsWorkspace = SettingUtil.GetConfig(
					this._extensionUri
				).serverWorkspace;
				this._workspace = this.getWorkspaceFromPath(this._settingsWorkspace);
			} else {
				this._workspace = this.firstListedWorkspace;
			}
			this._onWorkspaceChange.fire({
				oldPath: oldWorkspacePath ?? '',
				newPath: this.workspacePath ?? '',
			});
		} else {
			this.warnAboutBadPath(newPath);
			this._settingsWorkspace = newPath;
			this._workspace = this.firstListedWorkspace;
		}
	}

	private warnAboutBadPath(badPath: string) {
		const optMsg = this.workspace
			? `Using ${this.workspace?.name} instead.`
			: ``;
		vscode.window
			.showWarningMessage(
				`Cannot use workspace at ${badPath} for server. ${optMsg}`,
				CONFIG_MULTIROOT
			)
			.then((selection: vscode.MessageItem | undefined) => {
				if (selection == CONFIG_MULTIROOT) {
					vscode.commands.executeCommand(
						`${SETTINGS_SECTION_ID}.config.selectWorkspace`
					);
				}
			});
	}

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
	public pathExistsRelativeToWorkspace(file: string) {
		const fullPath = path.join(this.workspacePath ?? '', file);
		return fs.existsSync(fullPath);
	}

	public isLooseFilePath(file: string) {
		const absPath = path.join(this.workspacePath ?? '', file);
		return !fs.existsSync(absPath);
	}

	public hasNullPathSetting() {
		return this._settingsWorkspace == '';
	}

	public isAWorkspacePath(path: string) {
		const workspacePaths = vscode.workspace.workspaceFolders?.map(
			(e) => e.uri.fsPath
		);

		return workspacePaths?.includes(path);
	}
	private get firstListedWorkspace() {
		return vscode.workspace.workspaceFolders?.[0];
	}

	private getWorkspaceFromPath(workspacePath: string) {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length == 0) {
			return undefined;
		} else if (workspacePath == '') {
			if (this.numPaths > 1) {
				this.notifyMultiRootOpen();
			}
			return this.firstListedWorkspace;
		}

		if (workspaceFolders) {
			for (let i = 0; i < workspaceFolders.length; i++) {
				if (workspaceFolders[i].uri.fsPath == workspacePath) {
					return workspaceFolders[i];
				}
			}
		}

		return this.firstListedWorkspace;
	}

	private notifyMultiRootOpen() {
		if (
			!this._notifiedAboutMultiRoot &&
			SettingUtil.GetConfig(this._extensionUri).showWarningOnMultiRootOpen
		) {
			vscode.window
				.showWarningMessage(
					`There is no set default server workspace to use in your multi-root workspace, so the first workspace (${this.workspacePathname}) will be used.`,
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

	public getFileRelativeToWorkspace(path: string): string {
		const workspaceFolder = this.workspacePath;

		if (workspaceFolder && path.startsWith(workspaceFolder)) {
			return path.substr(workspaceFolder.length).replace(/\\/gi, '/');
		} else {
			return '';
		}
	}
}
