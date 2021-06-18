import * as vscode from 'vscode';

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

export function GetRelativeActiveFile(): string {
	const activeFile = vscode.window.activeTextEditor?.document.fileName;
	return activeFile ? GetRelativeFile(activeFile) : '';
}

export function GetRelativeFile(file: string): string {
	const workspaceFolder = GetWorkspacePath();

	if (workspaceFolder && file.startsWith(workspaceFolder)) {
		return file.substr(workspaceFolder.length).replace(/\\/gi, '/');
	} else {
		return '';
	}
}

export function GetWorkspacePath(): string | undefined {
	return GetWorkspace()?.uri.fsPath;
}

export function GetWorkspace() {
	return vscode.workspace.workspaceFolders?.[0];
}

export function isFileInjectable(file: string | undefined) {
	if (!file) {
		return false;
	}
	return (file.endsWith(".html"));
}