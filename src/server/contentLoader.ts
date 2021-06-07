import { Disposable } from '../dispose';
import { FormatFileSize, FormatDateTime } from '../utils';
import * as Stream from 'stream';
import { HTMLInjector } from './htmlInjector';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';

export interface IndexFileEntry {
	LinkSrc: string;
	LinkName: string;
	FileSize: string;
	DateTime: string;
}

export interface IndexDirEntry {
	LinkSrc: string;
	LinkName: string;
	DateTime: string;
}


export class ContentLoader extends Disposable {
	public scriptInjector: HTMLInjector | undefined;

	constructor() {
		super();
	}

	public createPageDoesNotExist(relativePath: string): Stream.Readable {
		// TODO: make look better
		const htmlString = `
		<!DOCTYPE html>
		<html>
			<body>
			<h1>File not found</h1>
			<p>The file <b>"${relativePath}"</b> cannot be found. It may have been moved, edited, or deleted.</p>
			</body>
			${this.scriptInjector?.script}
		</html>
		`;

		return Stream.Readable.from(htmlString);
	}

	public createIndexPage(
		readPath: string,
		relativePath: string
	): Stream.Readable {
		const childFiles = fs.readdirSync(readPath);

		const fileEntries = new Array<IndexFileEntry>();
		const dirEntries = new Array<IndexDirEntry>();

		if (relativePath != '/') {
			dirEntries.push({ LinkSrc: '/../', LinkName: '..', DateTime: '' });
		}

		for (const i in childFiles) {
			const relativeFileWithChild = path.join(relativePath, childFiles[i]);
			const absolutePath = path.join(readPath, childFiles[i]);

			const fileStats = fs.statSync(absolutePath);
			const modifiedDateTimeString = FormatDateTime(fileStats.mtime);

			if (fileStats.isDirectory()) {
				dirEntries.push({
					LinkSrc: relativeFileWithChild,
					LinkName: childFiles[i],
					DateTime: modifiedDateTimeString,
				});
			} else {
				const fileSize = FormatFileSize(fileStats.size);
				fileEntries.push({
					LinkSrc: relativeFileWithChild,
					LinkName: childFiles[i],
					FileSize: fileSize,
					DateTime: modifiedDateTimeString,
				});
			}
		}

		let directoryContents = '';

		dirEntries.forEach(
			(elem: IndexDirEntry) =>
				(directoryContents += `
				<tr>
				<td><a href="${elem.LinkSrc}">${elem.LinkName}/</a></td>
				<td></td>
				<td>${elem.DateTime}</td>
				</tr>\n`)
		);

		fileEntries.forEach(
			(elem: IndexFileEntry) =>
				(directoryContents += `
				<tr>
				<td><a href="${elem.LinkSrc}">${elem.LinkName}</a></td>
				<td>${elem.FileSize}</td>
				<td>${elem.DateTime}</td>
				</tr>\n`)
		);

		const htmlString = `
		<!DOCTYPE html>
		<html>
			<head>
				<style>
					table td {
						padding:4px;
					}
				</style>
			</head>
			<body>
			<h1>Index of ${relativePath}</h1>

			<table>
				<th>Name</th><th>Size</th><th>Date Modified</th>
				${directoryContents}
			</table>
			</body>
			
		${this.scriptInjector?.script}
		</html>
		`;

		return Stream.Readable.from(htmlString);
	}

	public getFileStream(
		readPath: string
	): Stream.Readable | fs.ReadStream | undefined {
		const workspaceDocuments = vscode.workspace.textDocuments;

		let i = 0;
		let stream;
		while (i < workspaceDocuments.length) {
			if (readPath == workspaceDocuments[i].fileName) {
				let fileContents = workspaceDocuments[i].getText();

				if (readPath.endsWith('.html')) {
					fileContents = this.scriptInjector?.script + fileContents;
				}

				stream = Stream.Readable.from(fileContents);
				break;
			}
			i++;
		}

		if (i == workspaceDocuments.length) {
			if (readPath.endsWith('.html')) {
				const buffer = fs.readFileSync(readPath);
				const injectedFileContents = this.scriptInjector?.script + buffer.toString();
				stream = Stream.Readable.from(injectedFileContents);
			} else {
				stream = fs.createReadStream(readPath);
			}
		}

		return stream;
	}
}