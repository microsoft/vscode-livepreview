/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../utils/dispose';
import * as path from 'path';
import { PathUtil } from '../utils/pathUtil';
import * as fs from 'fs';
import * as vscode from 'vscode';

/**
 * @description the object that manages the server endpoints for files outside of the default workspace
 *
 * encoding: actual file location -> endpoint used to access from server.
 * decoding: endpoint used to access from server -> actual file location.
 */
export class EndpointManager extends Disposable {
	// manages encoding and decoding endpoints

	private validEndpointRoots = new Set<string>();

	constructor() {
		super();
		let i = 0;
		const workspaceDocuments = vscode.workspace.textDocuments;
		while (i < workspaceDocuments.length) {
			if (
				!workspaceDocuments[i].isUntitled &&
				!PathUtil.AbsPathInAnyWorkspace(workspaceDocuments[i].fileName)
			) {
				this.encodeLooseFileEndpoint(workspaceDocuments[i].fileName);
			}
			i++;
		}
	}

	/**
	 * @param location the file location to encode.
	 * @returns the encoded endpoint.
	 */
	public async encodeLooseFileEndpoint(location: string): Promise<string> {
		const parent = await PathUtil.GetImmediateParentDir(location);
		let fullParent = await PathUtil.GetParentDir(location);
		const child = await PathUtil.GetFileName(location, true);

		fullParent = PathUtil.ConvertToUnixPath(fullParent);
		this.validEndpointRoots.add(fullParent);
		fullParent = PathUtil.EscapePathParts(fullParent);
		let endpoint_prefix = `/endpoint_unsaved`;
		if (parent != '.') {
			endpoint_prefix = `/${fullParent}`;
		}
		return path.join(endpoint_prefix, child);
	}

	public getEndpointParent(urlPath: string): string {
		let endpoint: string | undefined = urlPath.endsWith('/')
			? urlPath.substr(0, urlPath.length - 1)
			: urlPath;
		endpoint = endpoint.split('/').pop();

		if (!endpoint || endpoint == '/endpoint_unsaved') {
			return '.';
		}
		return unescape(endpoint);
	}

	/**
	 * @param {string} urlPath the endpoint to check
	 * @returns {string | undefined} the filesystem path that it loads or undefined if it doesn't decode to anything.
	 */
	public async decodeLooseFileEndpoint(urlPath: string): Promise<string | undefined> {
		const path = PathUtil.UnescapePathParts(urlPath);
		if (this.validPath(path)) {
			const exists = (await PathUtil.FileExistsStat(path)).exists;
			if (exists) {
				return path;
			}
		}
		return undefined;
	}

	/**
	 * @param {string} file the endpoint to check
	 * @returns {boolean} whether the endpoint can be decoded to an acutal file path.
	 */
	private validPath(file: string): boolean {
		for (const item of this.validEndpointRoots.values()) {
			if (file.startsWith(item)) {
				return true;
			}
		}
		return false;
	}
}
