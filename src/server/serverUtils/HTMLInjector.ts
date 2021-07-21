import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../infoManagers/connectionManager';
import {
	HTTP_URL_PLACEHOLDER,
	WS_URL_PLACEHOLDER,
} from '../../utils/constants';
import { Disposable } from '../../utils/dispose';

/**
 * @description the string replacement information for the `replace()` function
 */
interface replaceObj {
	original: string;
	replacement: string;
}

/**
 * @description the object responsible to loading the injected script and performing the appropriate replacements.
 * For more info about the script's purpose, see the jsdoc for `WSServer`.
 */
export class HTMLInjector extends Disposable {
	private _script: string | undefined;
	public rawScript: string;

	/**
	 * @description get the injected script (already has replacements).
	 * For debugging, to serve non-injected files, just change this to always return the empty string.
	 */
	public get script(): string | undefined {
		return this._script;
	}

	constructor(
		_extensionUri: vscode.Uri,
		private readonly _connectionManager: ConnectionManager
	) {
		super();
		const scriptPath = path.join(
			_extensionUri.fsPath,
			'media',
			'injectScript.js'
		);
		this.rawScript = fs.readFileSync(scriptPath, 'utf8').toString();
		this.initScript(this.rawScript);

		this._register(
			this._connectionManager.onConnected((e) => {
				this.refresh();
			})
		);
	}

	/**
	 * @description populate `this._script` with the script containing replacements for the server addresses.
	 * @param {string} fileString the raw loaded script with no replacements yet.
	 */
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

	/**
	 * @param {string} script the main string to perform replacements on
	 * @param {replaceObj[]} replaces array replacements to make
	 * @returns {string} string with all replacements performed on.
	 */
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

	/**
	 * @description re-populate the script field with replacements. Will re-query the connection manager for the port and host.
	 */
	public refresh() {
		this.initScript(this.rawScript);
	}
}
