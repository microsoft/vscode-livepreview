import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { serverMsg } from '../manager';
import { EndpointManager } from '../infoManagers/endpointManager';
import { WorkspaceManager } from '../infoManagers/workspaceManager';
import { Disposable } from '../utils/dispose';
import { serverTaskLinkProvider } from './serverTaskLinkProvider';
import { ServerTaskTerminal } from './serverTaskTerminal';
import { TASK_TERMINAL_BASE_NAME } from '../utils/constants';
import { ConnectionManager } from '../infoManagers/connectionManager';

interface ServerTaskDefinition extends vscode.TaskDefinition {
	args: string[];
}

export const ServerArgs: any = {
	verbose: '--verbose',
};

/**
 * @description The respose to a task's request to start the server. Either the server starts or it was already started manually.
 */
export enum ServerStartedStatus {
	JUST_STARTED,
	STARTED_BY_EMBEDDED_PREV,
}

/**
 * @description task provider for `Live Preview - Run Server` task.
 */
export class ServerTaskProvider
	extends Disposable
	implements vscode.TaskProvider
{
	public static CustomBuildScriptType = 'Live Preview';
	private _tasks: vscode.Task[] | undefined;
	private _terminal: ServerTaskTerminal | undefined;
	private _termName = '';
	private _terminalLinkProvider: serverTaskLinkProvider;

	// emitters to allow manager to communicate with the terminal.
	private readonly _onRequestToOpenServerEmitter = this._register(
		new vscode.EventEmitter<void>()
	);

	public readonly onRequestToOpenServer =
		this._onRequestToOpenServerEmitter.event;

	private readonly _onRequestOpenEditorToSide = this._register(
		new vscode.EventEmitter<vscode.Uri>()
	);

	public readonly onRequestOpenEditorToSide =
		this._onRequestOpenEditorToSide.event;

	private readonly _onRequestToCloseServerEmitter = this._register(
		new vscode.EventEmitter<void>()
	);

	public readonly onRequestToCloseServer =
		this._onRequestToCloseServerEmitter.event;

	constructor(
		private readonly _reporter: TelemetryReporter,
		endpointManager: EndpointManager,
		private readonly _workspaceManager: WorkspaceManager,
		_connectionManager: ConnectionManager
	) {
		super();
		this._terminalLinkProvider = this._register(
			new serverTaskLinkProvider(
				'',
				_reporter,
				endpointManager,
				_workspaceManager,
				_connectionManager
			)
		);
		this._terminalLinkProvider.onRequestOpenEditorToSide((e) => {
			this._onRequestOpenEditorToSide.fire(e);
		});
	}

	public get terminalName(): string {
		return this._termName;
	}

	public get isRunning(): boolean {
		if (this._terminal) {
			return this._terminal.running;
		}
		return false;
	}

	/**
	 * @param {serverMsg} msg the log information to send to the terminal for server logging.
	 */
	public sendServerInfoToTerminal(msg: serverMsg): void {
		if (this._terminal && this._terminal.running) {
			this._terminal.showServerMsg(msg);
		}
	}

	/**
	 * @param {vscode.Uri} externalUri the address where the server was started.
	 * @param {ServerStartedStatus} status information about whether or not the task started the server.
	 */
	public serverStarted(
		externalUri: vscode.Uri,
		status: ServerStartedStatus
	): void {
		if (this._terminal && this._terminal.running) {
			this._terminal.serverStarted(externalUri, status);
		}
	}

	/**
	 * Used to notify the terminal the result of their `stop server` request.
	 * @param {boolean} now whether or not the server stopped just now or whether it will continue to run
	 */
	public serverStop(now: boolean): void {
		if (this._terminal && this._terminal.running) {
			if (now) {
				this._terminal.serverStopped();
			} else {
				this._terminal.serverWillBeStopped();
			}
		}
	}

	/**
	 * Run task manually from extension
	 * @param {boolean} verbose whether to run with the `--verbose` flag.
	 */
	public extRunTask(verbose: boolean): void {
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

	public globalRunTask(): void {
		/* __GDPR__
			"tasks.terminal.startFromTasks.json" : {}
		*/
		vscode.tasks
			.fetchTasks()
			.then((tasks) => {
				const selTasks = tasks.filter(
					(x) =>
						(x.name === "Start App"));
				if (selTasks.length > 0) {
					vscode.tasks.executeTask(selTasks[0]);
				}
			});
	}

	public async provideTasks(): Promise<vscode.Task[]> {
		return this._getTasks();
	}

	public resolveTask(_task: vscode.Task): vscode.Task | undefined {
		const flavor: string = _task.definition.flavor;
		if (flavor) {
			const definition: ServerTaskDefinition = <any>_task.definition;
			return this._getTask(definition.flavor, definition);
		}
		return undefined;
	}

	private _getTasks(): vscode.Task[] {
		if (this._tasks !== undefined) {
			return this._tasks;
		}

		const args: string[][] = [[ServerArgs.verbose], []];

		this._tasks = [];
		args.forEach((args) => {
			this._tasks!.push(this._getTask(args));
		});
		return this._tasks;
	}

	private _getTask(
		args: string[],
		definition?: ServerTaskDefinition
	): vscode.Task {
		if (definition === undefined) {
			definition = {
				type: ServerTaskProvider.CustomBuildScriptType,
				args,
			};
		}

		let taskName = TASK_TERMINAL_BASE_NAME;
		for (const i in args) {
			taskName += ` ${args[i]}`;
		}
		if (this._terminal && this._terminal.running) {
			return new vscode.Task(
				definition,
				this._workspaceManager.workspace ?? vscode.TaskScope.Workspace,
				taskName,
				ServerTaskProvider.CustomBuildScriptType,
				undefined
			);
		}

		const custExec = new vscode.CustomExecution(
			async (): Promise<ServerTaskTerminal> => {
				// When the task is executed, this callback will run. Here, we set up for running the task.
				if (this._terminal && this._terminal.running) {
					return new ServerTaskTerminal([], this._reporter, false);
				}

				this._terminal = new ServerTaskTerminal(args, this._reporter);
				this._termName = taskName;
				this._terminalLinkProvider.terminalName = taskName;
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
			taskName,
			ServerTaskProvider.CustomBuildScriptType,
			custExec
		);
		task.isBackground = true;

		// currently, re-using a terminal will cause the link provider to fail
		// so we can create a new task terminal each time.
		task.presentationOptions.panel = vscode.TaskPanelKind.New;
		return task;
	}
}
