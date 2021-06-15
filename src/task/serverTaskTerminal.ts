import { Server } from 'http';
import * as vscode from 'vscode';
import { serverMsg } from '../manager';
import { HOST } from '../utils/constants';
import { Disposable } from '../utils/dispose';
import { FormatDateTime } from '../utils/utils';
import { ServerStartedStatus, ServerArgs } from './ServerTaskProvider';

enum TerminalColor {
	red = 31,
	green = 32,
	yellow = 33,
	blue = 34,
	purple = 35,
	cyan = 36,
}
enum TerminalDeco {
	reset = 0,
	bold = 1,
	underline = 4
}
const CHAR_CODE_CTRL_C = 3;

export class ServerTaskTerminal extends Disposable implements vscode.Pseudoterminal {
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

	constructor(args: string[], private readonly _executeServer = true) {
		super();
		if (this._executeServer) {
			this._verbose = args.some(x => x == ServerArgs.verbose);
		} 
	}

	private formatAddr(port: number) {
		return this.colorTerminalString(`http://${HOST}`,TerminalColor.blue,TerminalDeco.bold) + this.colorTerminalString(`:${port}`,TerminalColor.purple,TerminalDeco.bold);
	}

	public serverStarted(port: number, status: ServerStartedStatus) {
		switch (status) {
			case (ServerStartedStatus.JUST_STARTED): {

				this.writeEmitter.fire(`Started Server on ${this.formatAddr(port)}\r\n`);
				break;
			}
			case (ServerStartedStatus.STARTED_BY_EMBEDDED_PREV): {
				this.writeEmitter.fire(
					`Server already on at ${this.formatAddr(port)}\r\n> `
				);
				break;
			}
		}
		this.writeEmitter.fire(`Type ${this.colorTerminalString(
			`CTRL+C`,
			TerminalColor.red,
			TerminalDeco.bold
		)} to close the server.\r\n\r\n> `);
	}

	public serverStopped() {
		this.writeEmitter.fire(`Server stopped. Bye!`);
		this.close();
	}

	public serverWillBeStopped() {
		this.writeEmitter.fire(
			`This task will finish now, but the server will stop once you close your embedded preview.\r\n`
		);
		this.writeEmitter.fire(
			this.colorTerminalString(
				`Run 'Live Server: Force Stop Development Server' in the command palette to force close the server and close any previews.\r\n\r\n`,
				TerminalColor.yellow,
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
				`[${FormatDateTime(date, ' ')}] ${msg.method}: ${this.colorTerminalString(
					msg.url,TerminalColor.blue
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
		return this.colorTerminalString(status.toString(), color);
	}

	private colorTerminalString(input: string, color: TerminalColor, decoration = TerminalDeco.reset) {
		return `\x1b[${decoration};${color}m${input}\x1b[0m`;
	}

	handleInput(data: string) {
		if (data.length > 0 && data.charCodeAt(0) == CHAR_CODE_CTRL_C) {
			this.writeEmitter.fire(`Closing the server...\r\n`);
			this._onRequestToCloseServerEmitter.fire();
		}
	}
}
