/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * A collection of functions to perform path operations
 */
export class PathUtil {
	// used to idetify the path separators, `/` or `\\`.
	private static _pathSepRegex = /(?:\\|\/)+/;

	/**
	 * @description escapes a path, but keeps the `/` delimeter intact.
	 * @param {string} file the file path to escape.
	 * @returns {string} the escaped path.
	 */
	public static EscapePathParts(file: string): string {
		file = decodeURI(file);
		const parts = file.split('/');

		const newParts = parts
			.filter((part) => part.length > 0)
			.map((filterdPart) => encodeURI(filterdPart));
		return newParts.join('/');
	}

	/**
	 * @description reverses the work performed by `PathUtil.EscapePathParts`.
	 * @param {string} file the file path to unescape.
	 * @returns {string} the unescaped path.
	 */
	public static UnescapePathParts(file: string): string {
		const parts = file.split('/');
		const newParts = parts
			.filter((part) => part.length > 0)
			.map((filterdPart) => decodeURI(filterdPart));
		return newParts.join('/');
	}

	/**
	 * @param {string} file a file path.
	 * @returns {string} The parent pathname that the file belongs to; e.g. `c:/a/file/path.txt` returns `c:/a/file/`.
	 * Using `c:/a/file/` should return `c:/a/file/` since `c:/a/file/` is a directory already.
	 */
	public static GetParentDir(file: string): string {
		if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
			return file;
		}
		return path.dirname(file);
	}

	/**
	 * @param {string} file a file path.
	 * @returns {string} The most immediate parent director for the file; e.g. `c:/a/file/path.txt` returns `file`.
	 */
	public static GetImmediateParentDir(file: string): string | undefined {
		return PathUtil.GetParentDir(file).split(this._pathSepRegex).pop();
	}

	/**
	 * @param {string} file a file path.
	 * @param {boolean} returnEmptyOnDir whether to return an empty string when given an existing directory.
	 * @returns {string} The filename from the path; e.g. `c:/a/file/path.txt` returns `path.txt`.
	 */
	public static GetFileName(file: string, returnEmptyOnDir = false): string {
		if (
			returnEmptyOnDir &&
			fs.existsSync(file) &&
			fs.statSync(file).isDirectory()
		) {
			return '';
		}
		return path.basename(file);
	}

	/**
	 * @param {string} file1
	 * @param {string} file2
	 * @returns {boolean} whether `file1` and `file2` are equal when using the same path delimeter
	 */
	public static PathEquals(file1: string, file2: string): boolean {
		return path.normalize(file1) == path.normalize(file2);
	}

	/**
	 * @param {string} file1
	 * @param {string} file2
	 * @returns {boolean} whether `file1` is a child of `file2`.
	 */
	public static PathBeginsWith(file1: string, file2: string): boolean {
		return path.normalize(file1).startsWith(path.normalize(file2 + '/'));
	}

	/**
	 * @param {string} file the file to convert
	 * @returns {string} the file path using the `/` posix-compliant path delimeter.
	 */
	public static ConvertToPosixPath(file: string): string {
		return file.split(path.sep).join(path.posix.sep);
	}

	/**
	 * Get file path relative to workspace root.
	 * @param file
	 * @returns relative path (or undefined if the file does not belong to a workspace)
	 */

	public static getPathRelativeToWorkspace(file: vscode.Uri): string | undefined {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(file);
		if (!workspaceFolder) {
			return undefined;
		}
		return file.fsPath.substring(workspaceFolder.uri.fsPath.length);
	}

	/**
	 * @param {string} file the child path of the `Users` directory of the user data dir.
	 * @returns {string} the path to the `Users` directory of the user data dir.
	 */
	public static GetUserDataDirFromStorageUri(
		file: string | undefined
	): string | undefined {
		// a little hacky, but should work to find the target dir.
		if (!file) {
			return file;
		}
		file = PathUtil.ConvertToPosixPath(file);
		const parts = file.split('/');

		const newParts = [];
		for (const part of parts) {
			if (part.length > 0) {
				newParts.push(part);
			}
			if (part == 'User') {
				break;
			}
		}

		return newParts.join('/');
	}

	/**
	 * @description Similar to `_absPathInWorkspace`, but checks all workspaces and returns the matching workspace.
	 * @param {string} path path to test.
	 * @returns {vscode.WorkspaceFolder | undefined} the workspace it belongs to
	 */
	public static AbsPathInAnyWorkspace(
		file: string
	): vscode.WorkspaceFolder | undefined {
		const workspaces = vscode.workspace.workspaceFolders;
		return workspaces?.find((workspace) =>
			PathUtil.PathBeginsWith(file, workspace.uri.fsPath)
		);
	}

	/**
	 * @description Just like `pathExistsRelativeToDefaultWorkspace`, but tests all workspaces and returns the matching workspace.
	 * @param {string} file path to test.
	 * @returns {vscode.WorkspaceFolder | undefined} the workspace it belongs to
	 */
	public static PathExistsRelativeToAnyWorkspace(
		file: string
	): vscode.WorkspaceFolder | undefined {
		const workspaces = vscode.workspace.workspaceFolders;
		return workspaces?.find((workspace) =>
			fs.existsSync(path.join(workspace.uri.fsPath, file))
		);
	}
}
