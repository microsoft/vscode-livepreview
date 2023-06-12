/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../../utils/dispose';

/**
 * @description the status bar handler.
 * The flow is inspired by status bar in original Live Server extension:
 * https://github.com/ritwickdey/vscode-live-server/blob/master/src/StatusbarUi.ts
 */
export class StatusBarNotifier extends Disposable {
	private _statusBar: vscode.StatusBarItem;
	private _on: boolean;
	private _ports: Map<string | undefined, number>;

	constructor() {
		super();
		this._statusBar = this._register(
			vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
		);
		this._statusBar.name = vscode.l10n.t('Live Preview Ports');
		this.serverOff();
		this._on = false;
		this._ports = new Map<string, number>();
	}

	/**
	 * @description called to notify that the server turned on.
	 */
	public setServer(uri: vscode.Uri | undefined, port: number): void {
		this._on = true;
		this._statusBar.show();
		this._ports.set(uri?.toString(), port);
		this._refreshBar();
	}

	private _refreshBar(): void {
		let portsLabel: string;
		let portsTooltip: string;

		if (this._ports.size === 1) {
			const port = this._ports.values().next().value;
			portsLabel = vscode.l10n.t('Port: {0}', port);
		} else {
			if (this._ports.size === 2) {
				portsLabel = vscode.l10n.t('Ports: {0}', Array.from(this._ports.values()).join(', '));
			} else {
				portsLabel = vscode.l10n.t('{0} Ports', this._ports.size);
			}
		}

		const bulletPoints: string[] = [];

		this._ports.forEach((port, uriString) => {
			try {
				const workspace = uriString
					? vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(uriString))
					: undefined;
				bulletPoints.push(
					`\n\t• ${port} (${
						workspace
							? workspace.name
							: vscode.l10n.t('non-workspace files')
					})`
				);
			} catch {
				// no op
			}
		});

		portsTooltip =
			this._ports.size == 1
				? vscode.l10n.t('Live Preview running on port:')
				: vscode.l10n.t('Live Preview running on ports:') + ' ';

		portsTooltip += bulletPoints.join('');

		this._statusBar.tooltip = portsTooltip;
		this._statusBar.text = `$(radio-tower) ${portsLabel}`;
		this._statusBar.command = {
			title: vscode.l10n.t('Open Command Palette'),
			command: 'workbench.action.quickOpen',
			arguments: ['>Live Preview: '],
		};
	}

	/**
	 * @description called to notify that all of the servers are off
	 */
	public serverOff(): void {
		this._on = false;
		this._statusBar.hide();
	}

	/**
	 * @description called to notify that a server shut down.
	 */
	public removeServer(uri: vscode.Uri | undefined): void {
		this._ports.delete(uri?.toString());
		if (this._ports.size === 0) {
			this.serverOff();
		} else {
			this._refreshBar();
		}
	}
}
