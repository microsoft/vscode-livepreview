import * as vscode from 'vscode';
import * as path from 'path';

export class PathUtil {
	public static pathSepRegex = /(?:\\|\/)+/;

	// public static GetWorkspace(): vscode.WorkspaceFolder | undefined {
	// 	return vscode.workspace.workspaceFolders?.[0];
	// }

	// public static GetWorkspacePath(): string | undefined {
	// 	return PathUtil.GetWorkspace()?.uri.fsPath;
	// }

	public static GetActiveFolderPath() {
		const path = vscode.window.activeTextEditor?.document.uri.fsPath ?? '';
		return PathUtil.GetParentDir(path);
	}

	public static GetParentDir(file: string) {
		return path.dirname(file);
	}

	public static GetImmediateParentDir(file: string) {
		return PathUtil.GetParentDir(file).split(PathUtil.pathSepRegex).pop();
	}

	public static GetFurthestParentDir(file: string) {
		const paths = file.split(PathUtil.pathSepRegex);
		const result = PathUtil.GetFirstNonEmptyElem(paths);
		return result ?? '';
	}

	// public static PathExistsRelativeToWorkspace(file: string) {
	// 	const fullPath = path.join(PathUtil.GetWorkspacePath() ?? '', file);
	// 	return fs.existsSync(fullPath);
	// }

	public static GetFirstNonEmptyElem(paths: string[]) {
		for (const i in paths) {
			if (paths[i].length) {
				return paths[i];
			}
		}
		return undefined;
	}
	public static GetFileName(file: string) {
		return path.basename(file);
	}

	// public static IsLooseFilePath(file: string) {
	// 	const absPath = path.join(PathUtil.GetWorkspacePath() ?? '', file);
	// 	return !fs.existsSync(absPath);
	// }
}
