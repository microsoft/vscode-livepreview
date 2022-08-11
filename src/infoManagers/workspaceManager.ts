import { Disposable } from '../utils/dispose';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PathUtil } from '../utils/pathUtil';

/**
 * @description used to query information about the workspace(s).
 * Note that `WorkspaceManager.workspace` ("default" workspace) will return undefined for multi-root.
 * This is because multi-root relies solely on endpoints to access files.
 */
export class WorkspaceManager extends Disposable {

	constructor(
		private readonly _workspace: vscode.WorkspaceFolder | undefined) {
		super();
	}

	public get workspace(): vscode.WorkspaceFolder | undefined {
		return this._workspace;
	}

	public get workspacePath(): string | undefined {
		return this.workspace?.uri.fsPath;
	}

	public get workspaceURI(): vscode.Uri | undefined {
		return this._workspace?.uri;
	}

	public get workspacePathname(): string {
		return this.workspace?.name ?? '';
	}

	public get numPaths(): number {
		return vscode.workspace.workspaceFolders?.length ?? 0;
	}

	/**
	 * @description the first workspace in the workspace array.
	 */
	public get firstListedWorkspace(): vscode.WorkspaceFolder | undefined {
		return vscode.workspace.workspaceFolders?.[0];
	}

	public get workspaces() {
		return vscode.workspace.workspaceFolders;
	}

	/**
	 * @description Checks if a file is a child of the "default" workspace given its **absolute** file
	 *  (always returns false in multi-root or no workspace open).
	 *  e.g. with workspace `c:/a/file/path/`, and path `c:/a/file/path/continued/index.html`, this returns true.
	 * @param {string} path path to test.
	 * @returns whether the path is in the default workspace
	 */
	public absPathInDefaultWorkspace(path: string): boolean {
		return this.workspacePath
			? PathUtil.PathBeginsWith(path, this.workspacePath)
			: false;
	}
	/**
	 * @description Similar to `absPathInDefaultWorkspace`, but checks all workspaces.
	 * @param {string} path path to test.
	 * @returns {boolean} whether the path is in any open workspace.
	 */
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
	/**
	 * @description Checks if a file exists given its **relative** file to the "default" workspace.
	 *  (always returns false in multi-root or no workspace open).
	 *  e.g. with workspace `c:/a/file/path/`, and there exists `c:/a/file/path/continued/index.html`,
	 *  passing `path` as `/continued/index.html` will return true.
	 * @param {string} path path to test.
	 * @returns {boolean} whether the path exists relative the default workspace
	 */
	public pathExistsRelativeToDefaultWorkspace(file: string): boolean {
		if (!this.workspacePath) {
			return false;
		}
		const fullPath = path.join(this.workspacePath, file);
		return fs.existsSync(fullPath);
	}
	/**
	 * @description Just like `pathExistsRelativeToDefaultWorkspace`, but tests all workspaces.
	 * @param {string} path path to test.
	 * @returns {boolean} whether the path exists relative to any workspace
	 */
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

	/**
	 * @description Given an absolute file, get the file relative to the "default" workspace.
	 *  Will return empty string if `!absPathInDefaultWorkspace(path)`.
	 * @param {string} path the absolute path to convert.
	 * @returns {string} the equivalent relative path.
	 */
	public getFileRelativeToDefaultWorkspace(path: string): string | undefined {
		const workspaceFolder = this.workspacePath;

		if (workspaceFolder && this.absPathInDefaultWorkspace(path)) {
			return PathUtil.ConvertToUnixPath(path.substr(workspaceFolder.length));
		} else {
			return undefined;
		}
	}
}
