import * as vscode from 'vscode';
import { Disposable } from '../../utils/dispose';
import { SettingUtil } from '../../utils/settingsUtil';

/**
 * @description the status bar handler.
 * The flow is inspired by status bar in original Live Server extension:
 * https://github.com/ritwickdey/vscode-live-server/blob/master/src/StatusbarUi.ts
 */
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

	/**
	 * @description called to notify that the server turned on.
	 */
	public ServerOn(port: number) {
		this._on = true;
		if (SettingUtil.GetConfig(this._extensionUri).showStatusBarItem) {
			this._statusBar.show();
		}

		this._statusBar.text = `$(radio-tower) Port: ${port}`;
		this._statusBar.tooltip = `Live Server Preview running on port ${port}`;
		this._statusBar.command = {
			title: 'Open Command Palette',
			command: 'workbench.action.quickOpen',
			arguments: ['>Live Server Preview: '],
		};
	}

	/**
	 * @description called to notify that the server shut down.
	 */
	public ServerOff(): void {
		this._on = false;
		this._statusBar.hide();
	}

	/**
	 * @description update fields to address config changes.
	 */
	public updateConfigurations() {
		if (SettingUtil.GetConfig(this._extensionUri).showStatusBarItem) {
			if (this._on) {
				this._statusBar.show();
			}
		} else {
			this._statusBar.hide();
		}
	}
}
