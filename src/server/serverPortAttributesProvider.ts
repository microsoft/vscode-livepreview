import * as vscode from 'vscode';
import { Disposable } from '../utils/dispose';
export class serverPortAttributesProvider
	extends Disposable
	implements vscode.PortAttributesProvider
{
	// these ports are different from the ones in ConnectionManager, as these will contain tentative ports that
	// are about to be tested for connectivity.
	public wsPort = 0;
	public httpPort = 0;
	constructor() {
		super();
		vscode.workspace.registerPortAttributesProvider({}, this);
	}

	providePortAttributes(
		port: number,
		pid: number | undefined,
		commandLine: string | undefined,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.PortAttributes> {
		if (port == this.wsPort || port == this.httpPort) {
			return new vscode.PortAttributes(
				port,
				vscode.PortAutoForwardAction.Silent
			);
		}
		return undefined;
	}
}
