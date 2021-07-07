import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { serverMsg } from '../manager';
import { EndpointManager } from '../infoManagers/endpointManager';
import { WorkspaceManager } from '../infoManagers/workspaceManager';
import { Disposable } from '../utils/dispose';
import { serverTaskLinkProvider } from './serverTaskLinkProvider';
import { ServerTaskTerminal } from './serverTaskTerminal';

interface ServerTaskDefinition extends vscode.TaskDefinition {
	args: string[];
}

export const ServerArgs: any = {
	verbose: '--verbose',
};

export enum ServerStartedStatus {
	JUST_STARTED,
	STARTED_BY_EMBEDDED_PREV,
}
export class ServerTaskProvider
	extends Disposable
	implements vscode.TaskProvider
{
	static CustomBuildScriptType = 'Live Preview';
	private tasks: vscode.Task[] | undefined;
	private _terminal: ServerTaskTerminal | undefined;
	private _termName = '';
	private _terminalLinkProvider: serverTaskLinkProvider;
	private readonly _onRequestToOpenServerEmitter = this._register(
		new vscode.EventEmitter<void>()
	);

	private readonly _onRequestOpenEditorToSide = this._register(
		new vscode.EventEmitter<vscode.Uri>()
	);
	public readonly onRequestOpenEditorToSide =
		this._onRequestOpenEditorToSide.event;

	public get terminalName() {
		return this._termName;
	}

	public readonly onRequestToOpenServer =
		this._onRequestToOpenServerEmitter.event;

	private readonly _onRequestToCloseServerEmitter = this._register(
		new vscode.EventEmitter<void>()
	);

	public readonly onRequestToCloseServer =
		this._onRequestToCloseServerEmitter.event;

	constructor(
		private readonly _reporter: TelemetryReporter,
		endpointManager: EndpointManager,
		private readonly _workspaceManager: WorkspaceManager
	) {
		super();
		this._terminalLinkProvider = this._register(
			new serverTaskLinkProvider(
				'',
				_reporter,
				endpointManager,
				_workspaceManager
			)
		);
		this._terminalLinkProvider.onRequestOpenEditorToSide((e) => {
			this._onRequestOpenEditorToSide.fire(e);
		});
	}

	public get isRunning() {
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

	public serverStarted(externalUri: vscode.Uri, status: ServerStartedStatus) {
		if (this._terminal && this._terminal.running) {
			this._terminal.serverStarted(externalUri, status);
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

	// run task manually from extension.
	public extRunTask(verbose: boolean) {
		/* __GDPR__
			"tasks.terminal.startFromExtension" : {}
		*/
		this._reporter.sendTelemetryEvent('tasks.terminal.startFromExtension');
		vscode.tasks
			.fetchTasks({ type: ServerTaskProvider.CustomBuildScriptType })
			.then((tasks) => {
				const selTasks = tasks.filter(
					(x) =>
						(verbose &&
							x.definition.args.length > 0 &&
							x.definition.args[0] == ServerArgs.verbose) ||
						(!verbose && x.definition.args.length == 0)
				);
				if (selTasks.length > 0) {
					vscode.tasks.executeTask(selTasks[0]);
				}
			});
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

		const args: string[][] = [[ServerArgs.verbose], []];

		this.tasks = [];
		args.forEach((args) => {
			this.tasks!.push(this.getTask(args));
		});
		return this.tasks;
	}

	private getTask(
		args: string[],
		definition?: ServerTaskDefinition
	): vscode.Task {
		if (definition === undefined) {
			definition = {
				type: ServerTaskProvider.CustomBuildScriptType,
				args,
			};
		}

		let termName = `Run Server`;

		for (const i in args) {
			termName += ` ${args[i]}`;
		}
		if (this._terminal && this._terminal.running) {
			return new vscode.Task(
				definition,
				this._workspaceManager.workspace ?? vscode.TaskScope.Workspace,
				termName,
				ServerTaskProvider.CustomBuildScriptType,
				undefined
			);
		}

		const custExec = new vscode.CustomExecution(
			async (): Promise<ServerTaskTerminal> => {
				// When the task is executed, this callback will run. Here, we setup for running the task.
				if (this._terminal && this._terminal.running) {
					return new ServerTaskTerminal([], this._reporter, false);
				}

				this._terminal = new ServerTaskTerminal(args, this._reporter);
				this._termName = termName;
				this._terminalLinkProvider.terminalName = termName;
				this._terminal.onRequestToOpenServer((e) => {
					this._onRequestToOpenServerEmitter.fire(e);
				});

				this._terminal.onRequestToCloseServer((e) => {
					this._onRequestToCloseServerEmitter.fire(e);
				});

				return this._terminal;
			}
		);
		const task = new vscode.Task(
			definition,
			vscode.TaskScope.Workspace,
			termName,
			ServerTaskProvider.CustomBuildScriptType,
			custExec
		);
		task.isBackground = true;

		// currently, re-using a terminal will cause the link provider to fail
		// so we can create a new task terminal each time.
		task.presentationOptions.panel = vscode.TaskPanelKind.New;
		return task;
	}

	private readonly _onDisposeEmitter = this._register(
		new vscode.EventEmitter<void>()
	);
	public readonly onDispose = this._onDisposeEmitter.event;
}
