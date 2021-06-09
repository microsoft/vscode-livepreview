import * as vscode from 'vscode';
import { Disposable } from '../utils/dispose';

export class StatusBarNotifier extends Disposable {
	private _statusBar: vscode.StatusBarItem;

	constructor() {
		super();
		this._statusBar = this._register(
			vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
		);
		this._statusBar.show();
		this.ServerOff();
	}

	public ServerOn(port: number) {
		this._statusBar.text = `$(circle-slash) Server on Port ${port}`;
		this._statusBar.tooltip = 'Click to stop the server';
		this._statusBar.command = 'liveserver.end';
	}

	public ServerOff() {
		this._statusBar.text = `$(broadcast) Start Server`;
		this._statusBar.tooltip = 'Click to start the server and open the preview.';
		this._statusBar.command = 'liveserver.start.preview.atActiveFile';
	}

	public loading(command: string) {
		this._statusBar.text = `$(pulse) loading...`;
		this._statusBar.tooltip = 'Loading server ${command} command';
		this._statusBar.command = undefined;
	}
}
