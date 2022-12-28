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
	public static async GetParentDir(file: string): Promise<string> {

		const existsStatInfo = await PathUtil.FileExistsStat(file);
		if (existsStatInfo.exists && existsStatInfo.stat && existsStatInfo.stat.isDirectory()) {
			return file;
		}
		return path.dirname(file);
	}

	/**
	 * @param {string} file a file path.
	 * @returns {string} The most immediate parent director for the file; e.g. `c:/a/file/path.txt` returns `file`.
	 */
	public static async GetImmediateParentDir(file: string): Promise<string | undefined> {
		return (await PathUtil.GetParentDir(file)).split(this._pathSepRegex).pop();
	}

	/**
	 * @param {string} file a file path.
	 * @param {boolean} returnEmptyOnDir whether to return an empty string when given an existing directory.
	 * @returns {string} The filename from the path; e.g. `c:/a/file/path.txt` returns `path.txt`.
	 */
	public static async GetFileName(file: string, returnEmptyOnDir = false): Promise<string> {

		if (returnEmptyOnDir) {
			const existsStatInfo = await PathUtil.FileExistsStat(file);
			if (existsStatInfo.exists && existsStatInfo.stat && existsStatInfo.stat.isDirectory()) {
				return '';
			}
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
	 * @returns {string} the file path using the `/` unix path delimeter.
	 */
	public static ConvertToUnixPath(file: string): string {
		return file.replace(/\\/g, '/');
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
		file = PathUtil.ConvertToUnixPath(file);
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
	public static async PathExistsRelativeToAnyWorkspace(
		file: string
	): Promise<vscode.WorkspaceFolder | undefined> {
		const workspaces = vscode.workspace.workspaceFolders;

		if (!workspaces) {
			return undefined;
		}

		const promises = workspaces.map((workspace) =>
			PathUtil.FileExistsStat(path.join(workspace.uri.fsPath, file)));
		const idx = (await Promise.all(promises)).findIndex((elem) => elem.exists);
		if (idx === -1) {
			return undefined;
		}
		return workspaces[idx];
	}

	/**
	 * @param file
	 * @returns object containing exists and stat info
	 */
	public static async FileExistsStat(file: string): Promise<{ exists: boolean, stat: fs.Stats | undefined }> {
		return fs.promises.stat(file)
			.then((stat) => { return { exists: true, stat }; })
			.catch(() => { return { exists: false, stat: undefined }; });
	}

	/**
	 * Reads file in utf-8 encoding.
	 * @param file
	 * @returns file contents (or empty string if error encountered)
	 */
	public static async FileRead(file: string): Promise<string> {
		return fs.promises.readFile(file, 'utf-8')
			.then((data) => data.toString())
			.catch(() => '');
	}
}
