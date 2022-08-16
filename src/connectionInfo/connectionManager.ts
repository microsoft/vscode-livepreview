import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { Disposable } from '../utils/dispose';
import { DEFAULT_HOST } from '../utils/constants';
import { isIPv4 } from 'net';
import path = require('path');
import { SettingUtil } from '../utils/settingsUtil';
import { Connection, ConnectionInfo } from './connection';

const localize = nls.loadMessageBundle();
/**
 * @description the instance that keeps track of the host and port information for the http and websocket servers.
 * Upon requesting the host, it will resolve its external URI before returning it.
 */
export class ConnectionManager extends Disposable {
	private _connections: Map<vscode.Uri | undefined, Connection>; // undefined key means no workspace root

	constructor(private readonly _extensionUri: vscode.Uri) {
		super();

		this._connections = new Map<vscode.Uri, Connection>();
	}

	private readonly _onConnected = this._register(
		new vscode.EventEmitter<ConnectionInfo>()
	);

	public readonly onConnected = this._onConnected.event;

	public getConnectionFromPort(port: number) {
		this.connections.forEach((connection) => {
			if (connection.httpPort === port) {
				return connection;
			}
		});
		return undefined;
	}

	createAndAddNewConnection(
		serverPort: number,
		serverWSPort: number,
		serverHost: string,
		workspaceFolder: vscode.WorkspaceFolder | undefined
	) {
		const connection = new Connection(
			workspaceFolder,
			serverPort,
			serverWSPort,
			serverHost
		);

		connection.onConnected((e) => this._onConnected.fire(e));
		this._connections.set(workspaceFolder?.uri, connection);
		return connection;
	}

	removeConnection(workspaceFolder: vscode.WorkspaceFolder | undefined) {
		this._connections.get(workspaceFolder?.uri);
	}

	getConnection(workspaceFolder: vscode.WorkspaceFolder | undefined) {
		return this._connections.get(workspaceFolder?.uri);
	}

	get connections() {
		return Array.from(this._connections.values());
	}
}
