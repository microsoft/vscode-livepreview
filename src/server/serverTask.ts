import * as vscode from 'vscode';
import { serverMsg } from '../manager';
import { Disposable } from "../utils/dispose";
import { FormatDateTime } from '../utils/utils';

interface ServerTaskDefinition extends vscode.TaskDefinition {
	/**
	 * The build flavor. Should be either '32' or '64'.
	 */
	flavor: string;
}

export class ServerTaskProvider extends Disposable implements vscode.TaskProvider {
	static CustomBuildScriptType = 'Live Server'
	private tasks: vscode.Task[] | undefined;
	private _terminal: ServerTaskTerminal | undefined;
	private readonly _onRequestToOpenServerEmitter = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onRequestToOpenServer = this._onRequestToOpenServerEmitter.event;

	private readonly _onRequestToCloseServerEmitter = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onRequestToCloseServer = this._onRequestToCloseServerEmitter.event;

	public get serverRunning() {
		if (this._terminal) {
			return this._terminal.running;
		}
		return false;
	}

	public sendServerInfoToTerminal(msg: serverMsg) {
		if (this._terminal && this._terminal.running) {
			this._terminal.sendServerMsg(msg);
		}
	}
	public serverStarted(port: number, isNew: boolean) {
		if (this._terminal && this._terminal.running) {
			this._terminal.serverStarted(port, isNew);
		}
	}
	
	public serverStop(now: boolean) {
		if (this._terminal && this._terminal.running) {
			if (now) {
				this._terminal.serverStopped();
			} else {
				this._terminal.serverWillBeStopped();
			}
		}
	}

	// We use a CustomExecution task when state needs to be shared accross runs of the task or when 
	// the task requires use of some VS Code API to run.
	// If you don't need to share state between runs and if you don't need to execute VS Code API in your task, 
	// then a simple ShellExecution or ProcessExecution should be enough.
	// Since our build has this shared state, the CustomExecution is used below.
	private sharedState: string | undefined;

	constructor(private workspaceRoot: string) {
		super();
	}

	public async provideTasks(): Promise<vscode.Task[]> {
		return this.getTasks();
	}

	public resolveTask(_task: vscode.Task): vscode.Task | undefined {
		const flavor: string = _task.definition.flavor;
		if (flavor) {
			const definition: ServerTaskDefinition = <any>_task.definition;
			return this.getTask(definition.flavor, definition);
		}
		return undefined;
	}

	private getTasks(): vscode.Task[] {
		if (this.tasks !== undefined) {
			return this.tasks;
		}
		// In our fictional build, we have two build flavors
		const flavors: string[] = ['Run Live Server'];

		this.tasks = [];
		flavors.forEach(flavor => {
				this.tasks!.push(this.getTask(flavor));
		});
		return this.tasks;
	}

	private getTask(flavor: string, definition?: ServerTaskDefinition): vscode.Task {
		if (definition === undefined) {
			definition = {
				type: ServerTaskProvider.CustomBuildScriptType,
				flavor
			};
		}

		if (this._terminal && this._terminal.running) {
			vscode.window.showErrorMessage("cannot run more than one server task at once.");
			return new vscode.Task(definition, vscode.TaskScope.Workspace, flavor,
				ServerTaskProvider.CustomBuildScriptType, undefined);
		}

		const custExec = new vscode.CustomExecution(async (): Promise<ServerTaskTerminal> => {
			// When the task is executed, this callback will run. Here, we setup for running the task.
			this._terminal = new ServerTaskTerminal(this.workspaceRoot, flavor);
			this._terminal.onRequestToOpenServer((e)=> {
					this._onRequestToOpenServerEmitter.fire(e);
				});
		
			this._terminal.onRequestToCloseServer((e)=> {
				this._onRequestToCloseServerEmitter.fire(e);
			});
	
			return this._terminal;
		});

		return new vscode.Task(definition, vscode.TaskScope.Workspace, flavor,
			ServerTaskProvider.CustomBuildScriptType, custExec);
	}

	
	private readonly _onDisposeEmitter = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onDispose = this._onDisposeEmitter.event;

}

class ServerTaskTerminal extends Disposable implements vscode.Pseudoterminal {
	public running = false;
	private readonly _onRequestToOpenServerEmitter = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onRequestToOpenServer = this._onRequestToOpenServerEmitter.event;

	private readonly _onRequestToCloseServerEmitter = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onRequestToCloseServer = this._onRequestToCloseServerEmitter.event;

	private writeEmitter = new vscode.EventEmitter<string>();
	onDidWrite: vscode.Event<string> = this.writeEmitter.event;
	public closeEmitter = new vscode.EventEmitter<number>();
	onDidClose?: vscode.Event<number> = this.closeEmitter.event;

	constructor(private workspaceRoot: string, private flavor: string) {
		super();
	}
	public serverStarted(port: number, isNew: boolean) {
		if (isNew) {
			this.writeEmitter.fire(`Started Server on http://127.0.0.1:${port}\r\n`);
		} else {
			this.writeEmitter.fire(`Server already started with embedded preview on http://127.0.0.1:${port}\r\n`);
		}
		this.writeEmitter.fire(`Press ENTER to close the server.\r\n\r\n`);
	}

	public serverStopped() {
		this.writeEmitter.fire(`Server stopped. Bye!`);
		this.close();
	}

	public serverWillBeStopped() {
		this.writeEmitter.fire(`This task will finish now, but the server will stop once you close your embedded preview.\r\n`);
		this.writeEmitter.fire(`Run 'Live Server: Stop Development Server' in the command palette to force close the server and close any previews.\r\n\r\n`);
		this.close();
	}
	
	open(initialDimensions: vscode.TerminalDimensions | undefined): void {
		// At this point we can start using the terminal.
		this.running = true;
		this.writeEmitter.fire('Opening Server...\r\n');
		this._onRequestToOpenServerEmitter.fire();
	}

	close(): void {
		this.running = false;
		this._onRequestToCloseServerEmitter.fire();
		this.closeEmitter.fire(0);
	}

	
	public sendServerMsg(msg: serverMsg) {
		const date = new Date();

		const coloredStatusCode = msg.status >= 400 ? `\x1b[31m${msg.status}\x1b[0m`:`\x1b[32m${msg.status}\x1b[0m`;
		this.writeEmitter.fire(`[${FormatDateTime(date)}] ${msg.method}: \x1b[34m${msg.url}\x1b[0m | ${coloredStatusCode}\r\n`);
	}

	handleInput(data: string) {
		if (data == "\r") {
			this.writeEmitter.fire(`Closing the server...\r\n`);
			this._onRequestToCloseServerEmitter.fire();
		}
	}
}