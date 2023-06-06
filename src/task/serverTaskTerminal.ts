/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { Disposable } from '../utils/dispose';
import {
	TerminalColor,
	TerminalDeco,
	TerminalStyleUtil,
} from '../utils/terminalStyleUtil';
import { FormatDateTime } from '../utils/utils';
import { ServerStartedStatus } from './serverTaskProvider';
import { IServerMsg } from '../server/serverGrouping';

const CHAR_CODE_CTRL_C = 3;

/**
 * @description the pseudoterminal associated with the Live Preview task.
 */
export class ServerTaskTerminal
	extends Disposable
	implements vscode.Pseudoterminal {
	public running = false;

	// This object will request to open and close the server, so its parent
	// must listen for these requests and act accordingly.
	private readonly _onRequestToOpenServerEmitter = this._register(
		new vscode.EventEmitter<vscode.WorkspaceFolder | undefined>()
	);
	public readonly onRequestToOpenServer =
		this._onRequestToOpenServerEmitter.event;

	private readonly _onRequestToCloseServerEmitter = this._register(
		new vscode.EventEmitter<vscode.WorkspaceFolder | undefined>()
	);
	public readonly onRequestToCloseServer =
		this._onRequestToCloseServerEmitter.event;

	// `writeEmitter` and `closeEmitter` are inherited from the pseudoterminal.
	private _onDidWrite = new vscode.EventEmitter<string>();
	onDidWrite: vscode.Event<string> = this._onDidWrite.event;

	public _onDidClose = new vscode.EventEmitter<number>();
	onDidClose?: vscode.Event<number> = this._onDidClose.event;

	constructor(
		private readonly _reporter: TelemetryReporter,
		private _workspace: vscode.WorkspaceFolder | undefined,
		private readonly _executeServer = true
	) {
		super();
		if (this._executeServer) {
			/* __GDPR__
				"tasks.terminal.start" : {}
			*/
			this._reporter.sendTelemetryEvent('tasks.terminal.start');
		}
	}

	public open(): void {
		// At this point we can start using the terminal.
		if (this._executeServer) {
			this.running = true;
			this._onDidWrite.fire(
				vscode.l10n.t('Opening Server...') + '\r\n'
			);
			this._onRequestToOpenServerEmitter.fire(this._workspace);
		} else {
			this._onDidWrite.fire(
				vscode.l10n.t('serverAlreadyRunning','Server already running in another task. Closing now.') + '\r\n'
			);
			this.close();
		}
	}

	public close(): void {
		this.running = false;
		if (this._executeServer) {
			this._onRequestToCloseServerEmitter.fire(this._workspace);
			this._onDidClose.fire(0);
		} else {
			this._onDidClose.fire(1);
		}
	}

	public handleInput(data: string): void {
		if (data.length > 0 && data.charCodeAt(0) == CHAR_CODE_CTRL_C) {
			this._onDidWrite.fire(
				vscode.l10n.t('Closing the server...') + '\r\n'
			);

			this._onRequestToCloseServerEmitter.fire(this._workspace);
		}
	}

	/**
	 * @description called by the parent to notify that the server has started (or was already started) successfully and the task can now start.
	 * @param {vscode.Uri} externalUri the address of the server index.
	 * @param {ServerStartedStatus} status tells the terminal whether the server started because of the task or not.
	 */
	public serverStarted(
		externalUri: vscode.Uri,
		status: ServerStartedStatus
	): void {
		const formattedAddress = this._formatAddr(externalUri.toString());
		switch (status) {
			case ServerStartedStatus.JUST_STARTED: {
				this._onDidWrite.fire(
					vscode.l10n.t(
						'Started Server on {0}',
						formattedAddress + '\r\n'
					)
				);
				break;
			}
			case ServerStartedStatus.STARTED_BY_EMBEDDED_PREV: {
				this._onDidWrite.fire(
					vscode.l10n.t(
						'Server already on at {0}',
						formattedAddress + '\r\n> '
					)
				);
				break;
			}
		}
		this._onDidWrite.fire(
			vscode.l10n.t(
				'Type {0} to close the server.',
				TerminalStyleUtil.ColorTerminalString(
					`CTRL+C`,
					TerminalColor.red,
					TerminalDeco.bold
				)
			) + '\r\n\r\n> '
		);
	}

	/**
	 * @description Called by the parent to tell the terminal that the server has stopped. May have been a result of the task ending or the result of a manual server shutdown.
	 */
	public serverStopped(): void {
		this._onDidWrite.fire(
			vscode.l10n.t('Server stopped. Bye!') + '\n'
		);
		this.close();
	}

	/**
	 * Called the parent to tell the terminal that is it safe to end the task, but the server will continue to be on to support the embedded preview. This will end the task.
	 */
	public serverWillBeStopped(): void {
		this._onDidWrite.fire(
			vscode.l10n.t(`This task will finish now, but the server will stay on since you've used the embedded preview recently.`) + '\r\n'
		);
		this._onDidWrite.fire(
			TerminalStyleUtil.ColorTerminalString(
				vscode.l10n.t("Run 'Live Preview: Stop Server' in the command palette to close the server and close any previews.") + '\r\n\r\n',
				TerminalColor.yellow
			)
		);
		this.close();
	}

	/**
	 * @param {IServerMsg} msg the log message data from the HTTP server to show in the terminal
	 */
	public showServerMsg(msg: IServerMsg): void {
		const date = new Date();

		this._onDidWrite.fire(
			`[${FormatDateTime(date, ' ')}] ${msg.method
			}: ${TerminalStyleUtil.ColorTerminalString(
				decodeURI(msg.url),
				TerminalColor.blue
			)} | ${this._colorHttpStatus(msg.status)}\r\n> `
		);
	}

	/**
	 * @param {number} status the [HTTP status code](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status) sent by the server
	 * @returns {string} the styled terminal string (red, yellow, or green).
	 */
	private _colorHttpStatus(status: number): string {
		let color = TerminalColor.green;
		if (status >= 400) {
			color = TerminalColor.red;
		} else if (status >= 300) {
			color = TerminalColor.yellow;
		}
		return TerminalStyleUtil.ColorTerminalString(status.toString(), color);
	}

	/**
	 * @param {string} str string to test
	 * @returns {number} location of the second colon, used to find the colon before the port number.
	 */
	private _getSecondColonPos(str: string): number {
		const indexColon = str.indexOf(':');
		if (indexColon == -1) {
			return str.length;
		}

		const indexSecondColon = str.indexOf(':', indexColon + 1);
		return indexSecondColon == -1 ? str.length : indexSecondColon;
	}

	/**
	 * @param {string} addr web address to format
	 * @returns {string} `addr` with base address colored blue and port number colored purple.
	 */
	private _formatAddr(addr: string): string {
		const indexSecondColon = this._getSecondColonPos(addr);
		const firstHalfOfString = addr.substring(0, indexSecondColon);
		const lastHalfOfString = addr.substring(indexSecondColon);
		return (
			TerminalStyleUtil.ColorTerminalString(
				firstHalfOfString,
				TerminalColor.blue,
				TerminalDeco.bold
			) +
			TerminalStyleUtil.ColorTerminalString(
				lastHalfOfString,
				TerminalColor.purple,
				TerminalDeco.bold
			)
		);
	}
}
