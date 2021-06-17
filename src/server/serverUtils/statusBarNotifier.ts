import * as vscode from 'vscode';
import { Disposable } from '../../utils/dispose';
import { GetConfig } from '../../utils/utils';

// flow is inspired by status bar in original Live Server extension
// https://github.com/ritwickdey/vscode-live-server/blob/master/src/StatusbarUi.ts
export class StatusBarNotifier extends Disposable {
	private _statusBar: vscode.StatusBarItem;
	private _extensionUri: vscode.Uri;
	private _on: boolean;

	constructor(extensionUri: vscode.Uri) {
		super();
		this._statusBar = this._register(
			vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
		);
		this._extensionUri = extensionUri;
		this.ServerOff();
		this._on = false;
	}

	public ServerOn(port: number) {
		this._on = true;
		if (GetConfig(this._extensionUri).showStatusBarItem) {
			this._statusBar.show();
		}

		this._statusBar.text = `$(radio-tower) Port: ${port}`;
		this._statusBar.tooltip = `Live Sever running on port ${port}`;
	}

	public ServerOff() {
		this._on = false;
		this._statusBar.hide();
	}

	public updateConfigurations() {
		if (GetConfig(this._extensionUri).showStatusBarItem) {
			if (this._on) {
				this._statusBar.show();
			}
		} else {
			this._statusBar.hide();
		}
	}
}
