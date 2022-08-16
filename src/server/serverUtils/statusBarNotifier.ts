import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { Disposable } from '../../utils/dispose';
import { SettingUtil } from '../../utils/settingsUtil';

const localize = nls.loadMessageBundle();

/**
 * @description the status bar handler.
 * The flow is inspired by status bar in original Live Server extension:
 * https://github.com/ritwickdey/vscode-live-server/blob/master/src/StatusbarUi.ts
 */
export class StatusBarNotifier extends Disposable {
	private _statusBar: vscode.StatusBarItem;
	private _extensionUri: vscode.Uri;
	private _on: boolean;
	private _ports: Map<vscode.Uri | undefined,number>;

	constructor(extensionUri: vscode.Uri) {
		super();
		this._statusBar = this._register(
			vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
		);
		this._extensionUri = extensionUri;
		this.ServerOff();
		this._on = false;
		this._ports = new Map<vscode.Uri,number>();
	}

	/**
	 * @description called to notify that the server turned on.
	 */
	public setServer(uri: vscode.Uri | undefined, port: number) {
		this._on = true;
		if (SettingUtil.GetConfig(this._extensionUri).showStatusBarItem) {
			this._statusBar.show();
		}
		this._ports.set(uri, port);
		this._refreshBar();
	}

	private _refreshBar() {
		const portStr = Array.from(this._ports.values()).join(', ');
		const portsTitle = this._ports.size === 1 ? localize('port', 'Port') : localize('port', 'Ports');
		const portsLabel = localize('port', '{0}: {1}', portsTitle, portStr);
		this._statusBar.text = `$(radio-tower) ${portsLabel}`;
		this._statusBar.tooltip = localize(
			'livePreviewRunningOnPort',
			'Live Preview running on port {0}',
		);
		this._statusBar.command = {
			title: localize('openCommandPalette', 'Open Command Palette'),
			command: 'workbench.action.quickOpen',
			arguments: ['>Live Preview: '],
		};
	}

	/**
	 * @description called to notify that the servers shut down.
	 */
	public ServerOff(): void {
		this._on = false;
		this._statusBar.hide();
	}

	/**
 * @description called to notify that a server shut down.
 */
	public RemoveServer(uri: vscode.Uri | undefined): void {
		this._ports.delete(uri);
		if (this._ports.size === 0 ) {
			this.ServerOff();
		} else {
			this._refreshBar();
		}
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
