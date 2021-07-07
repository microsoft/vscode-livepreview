import * as Stream from 'stream';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';
import * as mime from 'mime';
import { Disposable } from '../../utils/dispose';
import {
	FormatFileSize,
	FormatDateTime,
	isFileInjectable,
} from '../../utils/utils';
import { HTMLInjector } from './HTMLInjector';
import TelemetryReporter from 'vscode-extension-telemetry';

export interface RespInfo {
	ContentType: string | undefined;
	Stream: Stream.Readable | fs.ReadStream | undefined;
}
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
	private _servedFiles: string[];

	constructor(private readonly _reporter: TelemetryReporter) {
		super();
		this._servedFiles = [];
	}

	public resetServedFiles() {
		this._servedFiles = [];
	}

	public get servedFiles() {
		return this._servedFiles;
	}

	public createPageDoesNotExist(relativePath: string): RespInfo {
		/* __GDPR__
			"server.pageDoesNotExist" : {}
		*/
		this._reporter.sendTelemetryEvent('server.pageDoesNotExist');
		// TODO: make look better
		const htmlString = `
		<!DOCTYPE html>
		<html>
			<head>
				<title>File not found</title>
			</head>
			<body>
				<h1>File not found</h1>
				<p>The file <b>"${relativePath}"</b> cannot be found. It may have been moved, edited, or deleted.</p>
			</body>
			${this.scriptInjector?.script}
		</html>
		`;

		return {
			Stream: Stream.Readable.from(htmlString),
			ContentType: 'text/html',
		};
	}

	public createIndexPage(
		readPath: string,
		relativePath: string,
		titlePath = relativePath
	): RespInfo {
		/* __GDPR__
			"server.indexPage" : {}
		*/
		this._reporter.sendTelemetryEvent('server.indexPage');

		const childFiles = fs.readdirSync(readPath);

		const fileEntries = new Array<IndexFileEntry>();
		const dirEntries = new Array<IndexDirEntry>();

		if (relativePath != '/') {
			dirEntries.push({ LinkSrc: '..', LinkName: '..', DateTime: '' });
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
				<td><a href="${elem.LinkSrc}/">${elem.LinkName}/</a></td>
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
				<title>Index of ${titlePath}</title>
			</head>
			<body>
			<h1>Index of ${titlePath}</h1>

			<table>
				<th>Name</th><th>Size</th><th>Date Modified</th>
				${directoryContents}
			</table>
			</body>
			
		${this.scriptInjector?.script}
		</html>
		`;

		return {
			Stream: Stream.Readable.from(htmlString),
			ContentType: 'text/html',
		};
	}

	public getFileStream(readPath: string, inFilesystem = true): RespInfo {
		this._servedFiles.push(readPath);
		const workspaceDocuments = vscode.workspace.textDocuments;
		let i = 0;
		let stream;
		let contentType = mime.getType(readPath) ?? 'text/plain';
		while (i < workspaceDocuments.length) {
			if (readPath == workspaceDocuments[i].fileName) {
				if (inFilesystem && workspaceDocuments[i].isUntitled) {
					continue;
				}
				let fileContents = workspaceDocuments[i].getText();

				if (workspaceDocuments[i].languageId == 'html') {
					fileContents = this.injectIntoFile(
						fileContents,
						this.scriptInjector?.script ?? ''
					);
					contentType = 'text/html';
				}

				stream = Stream.Readable.from(fileContents);
				break;
			}
			i++;
		}

		if (inFilesystem && i == workspaceDocuments.length) {
			if (isFileInjectable(readPath)) {
				const buffer = fs.readFileSync(readPath, 'utf8');
				const injectedFileContents = this.injectIntoFile(
					buffer.toString(),
					this.scriptInjector?.script ?? ''
				);
				stream = Stream.Readable.from(injectedFileContents);
			} else {
				stream = fs.createReadStream(readPath);
			}
		}

		return {
			Stream: stream,
			ContentType: contentType,
		};
	}

	private injectIntoFile(contents: string, scriptInjection: string): string {
		const re = new RegExp('<!DOCTYPE[\\s|\\w]*>', 'g');

		re.test(contents);

		let docTypeEnd = re.lastIndex;
		if (docTypeEnd == -1) {
			docTypeEnd = 0;
		}

		const newContents =
			contents.substr(0, docTypeEnd) +
			'\n' +
			scriptInjection +
			contents.substr(docTypeEnd);
		return newContents;
	}
}
