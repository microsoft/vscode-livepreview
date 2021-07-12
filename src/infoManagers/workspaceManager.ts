import { Disposable } from '../utils/dispose';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PathUtil } from '../utils/pathUtil';

export interface workspaceChangeMsg {
	oldPath: string;
	newPath: string;
}

export class WorkspaceManager extends Disposable {
	private _workspace: vscode.WorkspaceFolder | undefined;

	constructor() {
		super();
		if (this.numPaths == 1) {
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

	public get firstListedWorkspace() {
		return vscode.workspace.workspaceFolders?.[0];
	}

	public get workspaces() {
		return vscode.workspace.workspaceFolders;
	}

	public absPathInDefaultWorkspace(path: string) {
		return this.workspacePath
			? PathUtil.PathBeginsWith(path, this.workspacePath)
			: false;
	}

	public absPathInAnyWorkspace(file: string): boolean {
		if (this.workspaces) {
			for (const i in this.workspaces) {
				if (PathUtil.PathBeginsWith(file, this.workspaces[i].uri.fsPath)) {
					return true;
				}
			}
		}
		return false;
	}

	public pathExistsRelativeToDefaultWorkspace(file: string) {
		if (!this.workspacePath) {
			return false;
		}
		const fullPath = path.join(this.workspacePath, file);
		return fs.existsSync(fullPath);
	}

	public pathExistsRelativeToAnyWorkspace(file: string): boolean {
		if (this.workspaces) {
			for (const i in this.workspaces) {
				if (fs.existsSync(path.join(this.workspaces[i].uri.fsPath, file))) {
					return true;
				}
			}
		}
		return false;
	}

	public getFileRelativeToDefaultWorkspace(path: string): string {
		const workspaceFolder = this.workspacePath;

		if (workspaceFolder && path.startsWith(workspaceFolder)) {
			return path.substr(workspaceFolder.length).replace(/\\/gi, '/');
		} else {
			return '';
		}
	}
}
