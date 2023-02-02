/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../utils/dispose';
import { PathUtil } from '../utils/pathUtil';
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
				!PathUtil.GetWorkspaceFromAbsolutePath(workspaceDocuments[i].fileName)
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
		let fullParent = await PathUtil.GetParentDir(location);
		const child = await PathUtil.GetFileName(location, true);

		fullParent = PathUtil.ConvertToPosixPath(fullParent);
		this.validEndpointRoots.add(fullParent);

		let endpoint_prefix = `/endpoint_unsaved`;
		if ((await PathUtil.FileExistsStat(location)).exists) {
			endpoint_prefix = this.changePrefixesForAbsPathEncode(fullParent);
		}

		endpoint_prefix = PathUtil.EscapePathParts(endpoint_prefix);

		// don't use path.join so that we don't remove leading slashes
		const ret = `${endpoint_prefix}/${child}`;
		return ret;
	}

	/**
	 * Get the immediate parent of the encoded endpoint path. Needed to create index pages
	 * @param urlPath
	 */
	public getEndpointParent(urlPath: string): string {
		let endpoint: string | undefined = urlPath.endsWith('/')
			? urlPath.substr(0, urlPath.length - 1)
			: urlPath;
		endpoint = endpoint.split('/').pop();

		if (!endpoint || endpoint == '/endpoint_unsaved') {
			return '.';
		}
		return decodeURI(endpoint);
	}

	/**
	 * @param {string} urlPath the endpoint to check
	 * @returns {string | undefined} the filesystem path that it loads or undefined if it doesn't decode to anything.
	 */
	public async decodeLooseFileEndpoint(urlPath: string): Promise<string | undefined> {
		const path = this.changePrefixesForAbsPathDecode(PathUtil.UnescapePathParts(urlPath));
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

	/**
	 * Performs the prefix changes that happen when decoding an absolute file path.
	 * Public so that the link previewer can use it to create a file URI.
	 * @param urlPath
	 */
	public changePrefixesForAbsPathDecode(urlPath: string): string {
		let path = urlPath;

		if (urlPath.startsWith('/') && urlPath.length > 1) {
			path = urlPath.substring(1);
		}

		if (urlPath.startsWith('unc/')) {
			path = `//${urlPath.substring(4)}`;
		}

		return path;
	}

	/**
	 * Performs the prefix changes that happen when encoding an absolute file path.
	 * @param urlPath
	 */
	private changePrefixesForAbsPathEncode(urlPath: string): string {
		let path = `/${urlPath}`;

		if (urlPath.startsWith(`//`) && urlPath.length > 2) {
			// use `unc` to differentiate UNC paths
			path = `/unc/${urlPath.substring(2)}`;
		}

		return path;
	}
}
