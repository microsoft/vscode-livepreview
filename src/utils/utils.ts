import { pathToFileURL } from 'url';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function FormatDateTime(date: Date, delimeter = ', '): string {
	const mm = date.getMonth() + 1;
	const dd = date.getDate().toString().padStart(2, '0');
	const yy = date.getFullYear().toString().substring(2);

	const hh = date.getHours();
	const mi = date.getMinutes().toString().padStart(2, '0');
	const ss = date.getSeconds().toString().padStart(2, '0');

	return `${mm}/${dd}/${yy}${delimeter}${hh}:${mi}:${ss}`;
}

export function FormatFileSize(bytes: number) {
	const sizeUnits = ['B', 'kB', 'MB', 'GB'];

	let i = 0;
	while (i < sizeUnits.length) {
		if (bytes < Math.pow(1024, i + 1)) {
			const modifiedSize = (bytes / Math.pow(1024, i)).toFixed(1);
			return `${modifiedSize} ${sizeUnits[i]}`;
		}
		i++;
	}
	const modifiedSize = (bytes / Math.pow(1024, i)).toFixed(1);
	return `${modifiedSize} TB`;
}

// export function GetRelativeActiveFile(): string {
// 	const activeFile = GetActiveFile();
// 	return activeFile ? GetRelativeFile(activeFile) : '';
// }

export function GetActiveFile(): string | undefined {
	return vscode.window.activeTextEditor?.document.fileName;
}
// export function GetRelativeFile(file: string): string {
// 	const workspaceFolder = GetWorkspacePath();

// 	if (workspaceFolder && file.startsWith(workspaceFolder)) {
// 		return file.substr(workspaceFolder.length).replace(/\\/gi, '/');
// 	} else {
// 		return '';
// 	}
// }

export function GetWorkspacePath(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function GetActiveFolderPath() {
	const path = vscode.window.activeTextEditor?.document.uri.fsPath ?? "";
	return GetParentDir(path);
}

export function GetParentDir(file: string) {
	return path.dirname(file);
}

export function GetFileName(file: string) {
	return path.basename(file);
}

export function EncodeLooseFilePath(path: string) {
	return "/" + escape(GetParentDir(path)) + "/" + GetFileName(path);
}

export function DecodeLooseFilePath(file: string) {
	const parentPath = file.substr(file.indexOf("/")+1,file.lastIndexOf("/"));
	const fileName = file.substr(file.lastIndexOf("/"),file.length);
	return path.join(unescape(parentPath),fileName);
}

export function IsLooseFilePath(file: string) {
	const absPath = path.join(GetWorkspacePath() ?? '', file);
	return !fs.existsSync(absPath);
}
export function isFileInjectable(file: string | undefined) {
	if (!file) {
		return false;
	}
	return (file.endsWith(".html"));
}