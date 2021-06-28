import { Disposable } from '../utils/dispose';
import { SETTINGS_SECTION_ID, SettingUtil } from '../utils/settingsUtil';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG_MULTIROOT } from '../utils/constants';

export class WorkspaceManager extends Disposable {
	private readonly _workspace: vscode.WorkspaceFolder | undefined;
	public settingsWorkspace = '';
	public invalidPath = false;
	constructor(private readonly _extensionUri: vscode.Uri) {
		super();
		if (this.numPaths > 1) {
			this.settingsWorkspace = SettingUtil.GetConfig(
				this._extensionUri
			).serverWorkspace;
			this._workspace = this.getWorkspaceFromPath(this.settingsWorkspace);
		} else {
			this._workspace = this.firstListedWorkspace;
		}
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

	public pathExistsRelativeToWorkspace(file: string) {
		const fullPath = path.join(this.workspacePath ?? '', file);
		return fs.existsSync(fullPath);
	}

	public isLooseFilePath(file: string) {
		const absPath = path.join(this.workspacePath ?? '', file);
		return !fs.existsSync(absPath);
	}

	public hasNullPathSetting() {
		return this.settingsWorkspace == '';
	}
	private get firstListedWorkspace() {
		return vscode.workspace.workspaceFolders?.[0];
	}

	private getWorkspaceFromPath(workspaceName: string) {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length == 0) {
			return undefined;
		} else if (workspaceName == '') {
			return this.firstListedWorkspace;
		}

		if (workspaceFolders) {
			for (let i = 0; i < workspaceFolders.length; i++) {
				if (workspaceFolders[i].uri.fsPath == workspaceName) {
					return workspaceFolders[i];
				}
			}
		}
		this.invalidPath = true;
		return this.firstListedWorkspace;
	}
}