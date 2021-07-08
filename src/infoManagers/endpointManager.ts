import { Disposable } from '../utils/dispose';
import * as path from 'path';
import { PathUtil } from '../utils/pathUtil';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { WorkspaceManager } from './workspaceManager';
import { endianness } from 'os';

export class EndpointManager extends Disposable {
	// manages encoding and decoding endpoints

	private validEndpointRoots = new Set<string>();

	constructor(private readonly _workspaceManager: WorkspaceManager) {
		super();
		let i = 0;
		const workspaceDocuments = vscode.workspace.textDocuments;
		while (i < workspaceDocuments.length) {
			if (
				!workspaceDocuments[i].isUntitled &&
				!this._workspaceManager.canGetPath(workspaceDocuments[i].fileName)
			) {
				this.encodeLooseFileEndpoint(workspaceDocuments[i].fileName);
			}
			i++;
		}
	}
	public encodeLooseFileEndpoint(location: string): string {
		const parent = PathUtil.GetImmediateParentDir(location);
		let fullParent = PathUtil.GetParentDir(location);
		const child = PathUtil.GetFileName(location);

		fullParent = fullParent.replace(/\\/g, '/');
		this.validEndpointRoots.add(fullParent);
		fullParent = PathUtil.EscapePathParts(fullParent);
		let endpoint_prefix = `/endpoint_unsaved`;
		if (parent != '.') {
			endpoint_prefix = `/${fullParent}`;
		}
		// let endpoint;
		// do {
		// 	endpoint = `${endpoint_prefix}_${i}`;
		// 	result = this._looseFiles.get(endpoint);
		// 	if (result === fullParent) {
		// 		return path.join(endpoint, child);
		// 	}
		// 	i++;
		// } while (result);
		// this._looseFiles.set(endpoint, fullParent);
		return path.join(endpoint_prefix, child);
	}

	public getEndpointParent(urlPath: string) {
		let endpoint: string | undefined = urlPath.endsWith('/')
			? urlPath.substr(0, urlPath.length - 1)
			: urlPath;
		endpoint = endpoint.split('/').pop();

		if (!endpoint || endpoint == '/endpoint_unsaved') {
			return '.';
		}
		return unescape(endpoint);
	}

	// public refreshPath(
	// 	targetPath: string,
	// 	oldWorkspacePath: string,
	// 	newWorkspacePath: string
	// ) {
	// 	let decodedPath = this.decodeLooseFileEndpoint(targetPath);
	// 	if (!decodedPath) {
	// 		decodedPath = path.join(oldWorkspacePath, targetPath);
	// 	}
	// 	if (decodedPath.startsWith(newWorkspacePath)) {
	// 		return decodedPath.substr(newWorkspacePath.length);
	// 	} else {
	// 		return this.encodeLooseFileEndpoint(decodedPath);
	// 	}
	// }

	private validPath(file: string) {
		for (const item of this.validEndpointRoots.values()) {
			if (file.startsWith(item)) {
				return true;
			}
		}
		return false;
	}
	public decodeLooseFileEndpoint(urlPath: string): string | undefined {
		const path = PathUtil.UnescapePathParts(urlPath);
		if (this.validPath(path) && fs.existsSync(path)) {
			return path;
		} else {
			return undefined;
		}
	}
}
