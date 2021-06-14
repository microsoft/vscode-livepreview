import * as vscode from 'vscode';
import { serverMsg } from '../manager';
import { Disposable } from '../utils/dispose';
import { ServerTaskTerminal } from './ServerTaskTerminal';

interface ServerTaskDefinition extends vscode.TaskDefinition {
	flavor: string;
}

export const ServerTaskFlavors: any  = {
	verbose: "Server With Logging",
	nonVerbose: "Server With No Logging"
};

export class ServerTaskProvider
	extends Disposable
	implements vscode.TaskProvider
{
	static CustomBuildScriptType = 'Live Server';
	private tasks: vscode.Task[] | undefined;
	private _terminal: ServerTaskTerminal | undefined;
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

		const flavors: string[] = [ServerTaskFlavors.verbose, ServerTaskFlavors.nonVerbose];

		this.tasks = [];
		flavors.forEach((flavor) => {
			this.tasks!.push(this.getTask(flavor));
		});
		return this.tasks;
	}

	private getTask(
		flavor: string,
		definition?: ServerTaskDefinition
	): vscode.Task {
		if (definition === undefined) {
			definition = {
				type: ServerTaskProvider.CustomBuildScriptType,
				flavor,
			};
		}

		if (this._terminal && this._terminal.running) {
			return new vscode.Task(
				definition,
				vscode.TaskScope.Workspace,
				flavor,
				ServerTaskProvider.CustomBuildScriptType,
				undefined
			);
		}

		const custExec = new vscode.CustomExecution(
			async (): Promise<ServerTaskTerminal> => {
				// When the task is executed, this callback will run. Here, we setup for running the task.
				this._terminal = new ServerTaskTerminal(flavor);
				this._terminal.onRequestToOpenServer((e) => {
					this._onRequestToOpenServerEmitter.fire(e);
				});

				this._terminal.onRequestToCloseServer((e) => {
					this._onRequestToCloseServerEmitter.fire(e);
				});

				return this._terminal;
			}
		);

		return new vscode.Task(
			definition,
			vscode.TaskScope.Workspace,
			flavor,
			ServerTaskProvider.CustomBuildScriptType,
			custExec
		);
	}

	private readonly _onDisposeEmitter = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onDispose = this._onDisposeEmitter.event;
}