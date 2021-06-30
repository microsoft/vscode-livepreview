import { Disposable } from '../utils/dispose';
import * as path from 'path';
import { PathUtil } from '../utils/pathUtil';
import * as vscode from 'vscode';

export class EndpointManager extends Disposable {
	// manages encoding and decoding endpoints
	private readonly _looseFiles = new Map<
		/* endpoint: */ string,
		/* file location: */ string
	>();

	public encodeLooseFileEndpoint(location: string): string {
		let i = 0;
		const parent = PathUtil.GetImmediateParentDir(location);
		const fullParent = PathUtil.GetParentDir(location);
		const child = PathUtil.GetFileName(location);
		let result;
		let endpoint;
		do {
			endpoint = `/endpoint_${parent}_${i}`;
			result = this._looseFiles.get(endpoint);
			if (result === fullParent) {
				return path.join(endpoint, child);
			}
			i++;
		} while (result);
		this._looseFiles.set(endpoint, fullParent);
		return path.join(endpoint, child);
	}

	public getEndpointParent(urlPath: string) {
		const endpoint = PathUtil.GetFurthestParentDir(urlPath);
		const parentWithIndex = endpoint.substr(0, endpoint.lastIndexOf('_'));
		return parentWithIndex.substr(parentWithIndex.indexOf('_') + 1);
	}

	public refreshPath(
		targetPath: string,
		oldWorkspacePath: string,
		newWorkspacePath: string
	) {
		let decodedPath = this.decodeLooseFileEndpoint(targetPath);
		if (!decodedPath) {
			decodedPath = path.join(oldWorkspacePath, targetPath);
		}
		if (decodedPath.startsWith(newWorkspacePath)) {
			return decodedPath.substr(newWorkspacePath.length);
		} else {
			return this.encodeLooseFileEndpoint(decodedPath);
		}
	}

	public decodeLooseFileEndpoint(urlPath: string): string | undefined {
		const endpoint = `/${PathUtil.GetFurthestParentDir(urlPath)}`;
		const nonEndpoint = urlPath.substr(endpoint.length);
		const location = this._looseFiles.get(endpoint);

		if (location) {
			return path.join(location, nonEndpoint);
		} else {
			return undefined;
		}
	}
}
