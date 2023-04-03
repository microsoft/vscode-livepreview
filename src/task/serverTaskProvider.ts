/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { EndpointManager } from '../infoManagers/endpointManager';
import { Disposable } from '../utils/dispose';
import { serverTaskLinkProvider } from './serverTaskLinkProvider';
import { ServerTaskTerminal } from './serverTaskTerminal';
import { TASK_TERMINAL_BASE_NAME } from '../utils/constants';
import { ConnectionManager } from '../connectionInfo/connectionManager';
import { IServerMsg } from '../server/serverGrouping';
import { SettingUtil } from '../utils/settingsUtil';
import { IOpenFileOptions } from '../manager';

interface IServerTaskDefinition extends vscode.TaskDefinition {
	workspacePath?: string;
}

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
	implements vscode.TaskProvider {
	public static CustomBuildScriptType = 'Live Preview';
	private _tasks: vscode.Task[] | undefined;
	private _terminals: Map<string | undefined, ServerTaskTerminal>;
	private _terminalLinkProvider: serverTaskLinkProvider;
	private _runTaskWithExternalPreview;

	// emitters to allow manager to communicate with the terminal.
	private readonly _onRequestToOpenServerEmitter = this._register(
		new vscode.EventEmitter<vscode.WorkspaceFolder | undefined>()
	);

	public readonly onRequestToOpenServer =
		this._onRequestToOpenServerEmitter.event;

	private readonly _onRequestOpenEditorToSide = this._register(
		new vscode.EventEmitter<vscode.Uri>()
	);

	public readonly onRequestOpenEditorToSide =
		this._onRequestOpenEditorToSide.event;

	private readonly _onRequestToCloseServerEmitter = this._register(
		new vscode.EventEmitter<vscode.WorkspaceFolder | undefined>()
	);

	public readonly onRequestToCloseServer =
		this._onRequestToCloseServerEmitter.event;

	private readonly _onShouldLaunchPreview = this._register(
		new vscode.EventEmitter<{
			uri?: vscode.Uri;
			options?: IOpenFileOptions;
			previewType?: string;
		}>()
	);
	public readonly onShouldLaunchPreview = this._onShouldLaunchPreview.event;

	constructor(
		private readonly _reporter: TelemetryReporter,
		endpointManager: EndpointManager,
		connectionManager: ConnectionManager
	) {
		super();

		this._terminals = new Map<string, ServerTaskTerminal>();
		this._terminalLinkProvider = this._register(
			new serverTaskLinkProvider(_reporter, endpointManager, connectionManager)
		);

		this._register(
			this._terminalLinkProvider.onShouldLaunchPreview((e) =>
				this._onShouldLaunchPreview.fire(e)
			)
		);
		this._terminalLinkProvider.onRequestOpenEditorToSide((e) => {
			this._onRequestOpenEditorToSide.fire(e);
		});

		this._runTaskWithExternalPreview =
			SettingUtil.GetConfig().runTaskWithExternalPreview;

		this._register(
			vscode.workspace.onDidChangeConfiguration((e) => {
				this._runTaskWithExternalPreview =
					SettingUtil.GetConfig().runTaskWithExternalPreview;
			})
		);
	}

	public get isRunning(): boolean {
		return (
			Array.from(this._terminals.values()).find((term) => term.running) !==
			undefined
		);
	}

	/**
	 * given a workspace, check if there is a task for that workspace that is running
	 * @param workspace
	 */
	public isTaskRunning(workspace: vscode.WorkspaceFolder | undefined): boolean {
		const term = this._terminals.get(workspace?.uri.toString());
		return term?.running ?? false;
	}

	/**
	 * @param {IServerMsg} msg the log information to send to the terminal for server logging.
	 */
	public sendServerInfoToTerminal(
		msg: IServerMsg,
		workspace: vscode.WorkspaceFolder | undefined
	): void {
		const term = this._terminals.get(workspace?.uri.toString());
		if (term && term.running) {
			term.showServerMsg(msg);
		}
	}

	/**
	 * @param {vscode.Uri} externalUri the address where the server was started.
	 * @param {ServerStartedStatus} status information about whether or not the task started the server.
	 * @param {vscode.WorkspaceFolder | undefined} workspace the workspace associated with this action.
	 */
	public serverStarted(
		externalUri: vscode.Uri,
		status: ServerStartedStatus,
		workspace: vscode.WorkspaceFolder | undefined
	): void {
		const term = this._terminals.get(workspace?.uri.toString());
		if (term && term.running) {
			term.serverStarted(externalUri, status);
		}
	}

	/**
	 * Used to notify the terminal the result of their `stop server` request.
	 * @param {boolean} now whether or not the server stopped just now or whether it will continue to run
	 * @param {vscode.WorkspaceFolder | undefined} workspace the workspace associated with this action.
	 */
	public serverStop(
		now: boolean,
		workspace: vscode.WorkspaceFolder | undefined
	): void {
		const term = this._terminals.get(workspace?.uri.toString());
		if (term && term.running) {
			if (now) {
				term.serverStopped();
			} else {
				term.serverWillBeStopped();
			}
		}
	}

	/**
	 * Run task manually from extension
	 * @param {vscode.WorkspaceFolder | undefined} workspace the workspace associated with this action.
	 */
	public async extRunTask(
		workspace: vscode.WorkspaceFolder | undefined
	): Promise<void> {
		/* __GDPR__
			"tasks.terminal.startFromExtension" : {}
		*/
		this._reporter.sendTelemetryEvent('tasks.terminal.startFromExtension');
		const tasks = await vscode.tasks.fetchTasks({
			type: ServerTaskProvider.CustomBuildScriptType,
		});
		const selTasks = tasks.filter((x) => workspace === x.scope);

		if (selTasks.length > 0) {
			vscode.tasks.executeTask(selTasks[0]);
		}
	}

	public provideTasks(): vscode.Task[] {
		return this._getTasks();
	}

	/**
	 * The function called to create a task from a task definition in tasks.json
	 * @param _task the task from tasks.json
	 * @returns
	 */
	public resolveTask(_task: vscode.Task): vscode.Task | undefined {
		const definition: IServerTaskDefinition = <any>_task.definition;
		let workspace: vscode.WorkspaceFolder | undefined;
		try {
			workspace = <vscode.WorkspaceFolder>_task.scope;
		} catch (e) {
			// no op
		}
		return this._getTask(definition, workspace);
	}

	public get runTaskWithExternalPreview(): boolean {
		return this._runTaskWithExternalPreview;
	}

	/**
	 * @returns the array of all possible tasks
	 */
	private _getTasks(): vscode.Task[] {
		if (this._tasks !== undefined) {
			return this._tasks;
		}

		this._tasks = [];
		if (vscode.workspace.workspaceFolders) {
			vscode.workspace.workspaceFolders.forEach((workspace) => {
				this._tasks!.push(
					this._getTask(
						{
							type: ServerTaskProvider.CustomBuildScriptType,
						},
						workspace
					)
				);
			});
		} else {
			this._tasks!.push(
				this._getTask(
					{
						type: ServerTaskProvider.CustomBuildScriptType,
					},
					undefined
				)
			);
		}
		return this._tasks;
	}

	/**
	 * make a task for this configuration
	 * @param definition
	 * @param workspace
	 * @returns the task with the proper details and callback
	 */
	private _getTask(
		definition: IServerTaskDefinition,
		workspace: vscode.WorkspaceFolder | undefined
	): vscode.Task {
		definition.workspacePath = workspace?.uri.fsPath;

		const taskName = TASK_TERMINAL_BASE_NAME;

		const term = this._terminals.get(workspace?.uri.toString());

		if (term && term.running) {
			return new vscode.Task(
				definition,
				workspace ?? vscode.TaskScope.Global,
				taskName,
				ServerTaskProvider.CustomBuildScriptType,
				undefined
			);
		}

		const custExec = new vscode.CustomExecution(
			async (): Promise<ServerTaskTerminal> => {
				// When the task is executed, this callback will run. Here, we set up for running the task.
				const term = this._terminals.get(workspace?.uri.toString());
				if (term && term.running) {
					return term;
				}

				const newTerm = new ServerTaskTerminal(this._reporter, workspace);

				newTerm.onRequestToOpenServer((e) => {
					this._onRequestToOpenServerEmitter.fire(e);
				});

				newTerm.onRequestToCloseServer((e) => {
					this._onRequestToCloseServerEmitter.fire(e);
					this._terminals.delete(workspace?.uri.toString());
				});

				this._terminals.set(workspace?.uri.toString(), newTerm);

				return newTerm;
			}
		);
		const task = new vscode.Task(
			definition,
			workspace ?? vscode.TaskScope.Global,
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
