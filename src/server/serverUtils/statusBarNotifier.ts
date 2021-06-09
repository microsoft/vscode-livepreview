import * as vscode from 'vscode';
import { Disposable } from '../../utils/dispose';
import { GetConfig, LaunchPreviewOnServerStart } from '../../utils/utils';

// flow is inspired by status bar in original Live Server extension
// https://github.com/ritwickdey/vscode-live-server/blob/master/src/StatusbarUi.ts
export class StatusBarNotifier extends Disposable {
	private _statusBar: vscode.StatusBarItem;
	private _extensionUri: vscode.Uri;

	constructor(extensionUri: vscode.Uri) {
		super();
		this._statusBar = this._register(
			vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
		);
		this._extensionUri = extensionUri;

		if(GetConfig(extensionUri).showStatusBarItem) {
			this._statusBar.show();
		} else {
			this._statusBar.hide();
		}
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

		const config = GetConfig(this._extensionUri).launchPreviewOnServerStart;
		if (config == LaunchPreviewOnServerStart.embeddedPreview) {
			this._statusBar.command = 'liveserver.start.preview.atActiveFile';
		} else if (config == LaunchPreviewOnServerStart.externalBrowser) {
			this._statusBar.command = 'liveserver.start.externalPreview.atActiveFile';
		}
	}

	public loading(command: string) {
		this._statusBar.text = `$(pulse) loading...`;
		this._statusBar.tooltip = `Loading server ${command} command`;
		this._statusBar.command = undefined;
	}

	public updateConfigurations() {
		if(GetConfig(this._extensionUri).showStatusBarItem) {
			this._statusBar.show();
		} else {
			this._statusBar.hide();
		}
	}
}
