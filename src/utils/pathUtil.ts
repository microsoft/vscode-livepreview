import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class PathUtil {
	public static GetWorkspace(): vscode.WorkspaceFolder | undefined {
		return vscode.workspace.workspaceFolders?.[0];
	}

	public static GetWorkspacePath(): string | undefined {
		return PathUtil.GetWorkspace()?.uri.fsPath;
	}

	public static GetActiveFolderPath() {
		const path = vscode.window.activeTextEditor?.document.uri.fsPath ?? '';
		return PathUtil.GetParentDir(path);
	}

	public static GetParentDir(file: string) {
		return path.dirname(file);
	}

	public static GetFileName(file: string) {
		return path.basename(file);
	}

	public static EncodeLooseFilePath(path: string) {
		return (
			'/' +
			escape(PathUtil.GetParentDir(path)) +
			'/' +
			PathUtil.GetFileName(path)
		);
	}

	public static DecodeLooseFilePath(file: string) {
		return unescape(file).substr(1);
	}

	public static IsLooseFilePath(file: string) {
		const absPath = path.join(PathUtil.GetWorkspacePath() ?? '', file);
		return !fs.existsSync(absPath);
	}
}
