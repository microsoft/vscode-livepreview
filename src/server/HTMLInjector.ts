import { WS_PORTNUM_PLACEHOLDER } from '../constants';
import { Disposable } from '../dispose';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export class HTMLInjector extends Disposable {
	private readonly _pre_port_script: string;
	private readonly _post_port_script: string;
	public ws_port;
	constructor(extensionUri: vscode.Uri, ws_port:number) {
		super();
		const scriptPath = path.join(
			extensionUri.fsPath,
			'media',
			'inject_script.html'
		);
		this.ws_port = ws_port;
		const fileString = fs.readFileSync(scriptPath).toString();
		const placeHolderIndex = fileString.indexOf(WS_PORTNUM_PLACEHOLDER);
		this._pre_port_script = fileString.substr(0,placeHolderIndex);
		this._post_port_script = fileString.substr(placeHolderIndex + WS_PORTNUM_PLACEHOLDER.length);
	}
	public get script() {
		return this._pre_port_script + this.ws_port + this._post_port_script;
	}
}
