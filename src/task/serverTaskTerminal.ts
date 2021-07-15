import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { serverMsg } from '../manager';
import { Disposable } from '../utils/dispose';
import {
	TerminalColor,
	TerminalDeco,
	TerminalStyleUtil,
} from '../utils/terminalStyleUtil';
import { FormatDateTime } from '../utils/utils';
import { ServerStartedStatus, ServerArgs } from './serverTaskProvider';

const CHAR_CODE_CTRL_C = 3;

export class ServerTaskTerminal
	extends Disposable
	implements vscode.Pseudoterminal
{
	public running = false;
	private readonly _onRequestToOpenServerEmitter = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onRequestToOpenServer =
		this._onRequestToOpenServerEmitter.event;

	private readonly _onRequestToCloseServerEmitter = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onRequestToCloseServer =
		this._onRequestToCloseServerEmitter.event;

	private readonly _verbose;
	private writeEmitter = new vscode.EventEmitter<string>();
	onDidWrite: vscode.Event<string> = this.writeEmitter.event;
	public closeEmitter = new vscode.EventEmitter<number>();
	onDidClose?: vscode.Event<number> = this.closeEmitter.event;

	constructor(
		args: string[],
		private readonly _reporter: TelemetryReporter,
		private readonly _executeServer = true
	) {
		super();
		if (this._executeServer) {
			/* __GDPR__
				"tasks.terminal.start" : {}
			*/
			this._reporter.sendTelemetryEvent('tasks.terminal.start');
			this._verbose = args.some((x) => x == ServerArgs.verbose);
		}
	}

	private getSecondColonPos(str: string) {
		const indexColon = str.indexOf(':');
		if (indexColon == -1) {
			return str.length;
		}

		const indexSecondColon = str.indexOf(':', indexColon + 1);
		return indexSecondColon == -1 ? str.length : indexSecondColon;
	}

	private formatAddr(addr: string) {
		const indexSecondColon = this.getSecondColonPos(addr);
		const firstHalfOfString = addr.substr(0, indexSecondColon);
		const lastHalfOfString = addr.substr(indexSecondColon);
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

	public serverStarted(externalUri: vscode.Uri, status: ServerStartedStatus) {
		const formattedAddress = this.formatAddr(externalUri.toString());
		switch (status) {
			case ServerStartedStatus.JUST_STARTED: {
				this.writeEmitter.fire(`Started Server on ${formattedAddress}\r\n`);
				break;
			}
			case ServerStartedStatus.STARTED_BY_EMBEDDED_PREV: {
				this.writeEmitter.fire(
					`Server already on at ${formattedAddress}\r\n> `
				);
				break;
			}
		}
		this.writeEmitter.fire(
			`Type ${TerminalStyleUtil.ColorTerminalString(
				`CTRL+C`,
				TerminalColor.red,
				TerminalDeco.bold
			)} to close the server.\r\n\r\n> `
		);
	}

	public serverStopped() {
		this.writeEmitter.fire(`Server stopped. Bye!`);
		this.close();
	}

	public serverWillBeStopped() {
		this.writeEmitter.fire(
			`This task will finish now, but the server will stay on since you've used the embedded preview recently.\r\n`
		);
		this.writeEmitter.fire(
			TerminalStyleUtil.ColorTerminalString(
				`Run 'Stop Live Preview Server' in the command palette to close the server and close any previews.\r\n\r\n`,
				TerminalColor.yellow
			)
		);
		this.close();
	}

	open(): void {
		// At this point we can start using the terminal.
		if (this._executeServer) {
			this.running = true;
			this.writeEmitter.fire('Opening Server...\r\n');
			this._onRequestToOpenServerEmitter.fire();
		} else {
			this.writeEmitter.fire(
				`Server already running in another task. Closing now.\r\n`
			);
			this.close();
		}
	}

	close(): void {
		this.running = false;
		if (this._executeServer) {
			this._onRequestToCloseServerEmitter.fire();
			this.closeEmitter.fire(0);
		} else {
			this.closeEmitter.fire(1);
		}
	}

	public sendServerMsg(msg: serverMsg) {
		if (this._verbose) {
			const date = new Date();

			this.writeEmitter.fire(
				`[${FormatDateTime(date, ' ')}] ${
					msg.method
				}: ${TerminalStyleUtil.ColorTerminalString(
					msg.url,
					TerminalColor.blue
				)} | ${this.colorHttpStatus(msg.status)}\r\n> `
			);
		}
	}

	private colorHttpStatus(status: number) {
		let color = TerminalColor.green;
		if (status >= 400) {
			color = TerminalColor.red;
		} else if (status >= 300) {
			color = TerminalColor.yellow;
		}
		return TerminalStyleUtil.ColorTerminalString(status.toString(), color);
	}

	handleInput(data: string) {
		if (data.length > 0 && data.charCodeAt(0) == CHAR_CODE_CTRL_C) {
			this.writeEmitter.fire(`Closing the server...\r\n`);
			this._onRequestToCloseServerEmitter.fire();
		}
	}
}
