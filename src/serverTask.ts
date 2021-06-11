import * as vscode from 'vscode';
import { Disposable } from "./utils/dispose";

export class ServerTask extends Disposable implements vscode.TaskProvider {
	constructor() {
		super();
	}
	provideTasks(token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task[]> {
		throw new Error("Method not implemented.");
	}
	resolveTask(task: vscode.Task, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Task> {
		throw new Error("Method not implemented.");
	}

	private readonly _onPortChangeEmitter = this._register(
		new vscode.EventEmitter<void>()
	);

	public readonly onPortChange = this._onPortChangeEmitter.event;

}