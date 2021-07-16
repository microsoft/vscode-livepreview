import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../infoManagers/connectionManager';
import {
	HTTP_URL_PLACEHOLDER,
	WS_URL_PLACEHOLDER,
} from '../../utils/constants';
import { Disposable } from '../../utils/dispose';

interface replaceObj {
	original: string;
	replacement: string;
}
export class HTMLInjector extends Disposable {
	private _script: string | undefined;
	public rawScript: string;

	public get script() {
		return this._script;
	}
	constructor(
		extensionUri: vscode.Uri,
		private readonly _connectionManager: ConnectionManager
	) {
		super();
		const scriptPath = path.join(
			extensionUri.fsPath,
			'src',
			'server',
			'serverMedia',
			'injectScript.js'
		);
		this.rawScript = fs.readFileSync(scriptPath, 'utf8').toString();
		this.initScript(this.rawScript);
	}

	private async initScript(fileString: string) {
		const httpUri = await this._connectionManager.resolveExternalHTTPUri();
		const wsUri = await this._connectionManager.resolveExternalWSUri();
		const wsURL = `ws://${wsUri.authority}`;
		let httpURL = `${httpUri.scheme}://${httpUri.authority}`;

		if (httpURL.endsWith('/')) {
			httpURL = httpURL.substr(httpURL.length - 1);
		}
		const replacements = [
			{ original: WS_URL_PLACEHOLDER, replacement: wsURL },
			{ original: HTTP_URL_PLACEHOLDER, replacement: httpURL },
		];
		this._script = this.replace(fileString, replacements);
	}

	private replace(script: string, replaces: replaceObj[]): string {
		for (const i in replaces) {
			const replace = replaces[i];
			const placeHolderIndex = script.indexOf(replace.original);
			script =
				script.substr(0, placeHolderIndex) +
				replace.replacement +
				script.substr(placeHolderIndex + replace.original.length);
		}
		return script;
	}

	public refresh() {
		this.initScript(this.rawScript);
	}
}
