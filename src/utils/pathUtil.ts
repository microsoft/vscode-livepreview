import * as vscode from 'vscode';
import * as path from 'path';

export class PathUtil {
	public static pathSepRegex = /(?:\\|\/)+/;

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
}
