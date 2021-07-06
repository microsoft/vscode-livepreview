import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { WS_PORTNUM_PLACEHOLDER } from '../../utils/constants';
import { Disposable } from '../../utils/dispose';

export class HTMLInjector extends Disposable {
	private readonly _pre_port_script: string;
	private readonly _post_port_script: string;
	public wsURL: string;

	constructor(extensionUri: vscode.Uri, wsUri: vscode.Uri) {
		super();
		const scriptPath = path.join(
			extensionUri.fsPath,
			'media',
			'inject_script.html'
		);
		this.wsURL = `ws://${wsUri.authority}`;
		const fileString = fs.readFileSync(scriptPath, 'utf8').toString();
		const placeHolderIndex = fileString.indexOf(WS_PORTNUM_PLACEHOLDER);
		this._pre_port_script = fileString.substr(0, placeHolderIndex);
		this._post_port_script = fileString.substr(
			placeHolderIndex + WS_PORTNUM_PLACEHOLDER.length
		);
	}

	public set wsURI(uri: vscode.Uri) {
		this.wsURL = `ws://${uri.authority}`;
	} 
	public get script() {
		return this._pre_port_script + this.wsURL + this._post_port_script;
	}
}
