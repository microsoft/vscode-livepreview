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

export function GetActiveFile(): string | undefined {
	return vscode.window.activeTextEditor?.document.fileName;
}

export function isFileInjectable(file: string | undefined) {
	if (!file) {
		return false;
	}
	const fileEndingRegex = /\.([^/.]+)$/; // regex for seeing if there is a file ending
	const hasFileEnding = fileEndingRegex.test(file);
	return !hasFileEnding || hasInjectableFileEnding(file);
}

export function hasInjectableFileEnding(file: string) {
	const supportedEndings = ['.html', '.htm', '.xhtml'];
	for (const i in supportedEndings) {
		if (file.endsWith(supportedEndings[i])) {
			return true;
		}
	}
	return false;
}

export function getNonce() {
	let text = '';
	const possible =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 64; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
