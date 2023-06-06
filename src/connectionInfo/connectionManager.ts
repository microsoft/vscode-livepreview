/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isIPv4 } from 'net';
import * as vscode from 'vscode';
import { DEFAULT_HOST } from '../utils/constants';
import { Disposable } from '../utils/dispose';
import { PathUtil } from '../utils/pathUtil';
import { SETTINGS_SECTION_ID, SettingUtil } from '../utils/settingsUtil';
import { Connection, ConnectionInfo } from './connection';

/**
 * @description keeps track of all of the Connection objects and the info needed to create them (ie: initial ports).
 */
export class ConnectionManager extends Disposable {
	private _initHttpPort: number;
	private _initWSPort: number;
	private _initHost: string;
	private _connections: Map<string | undefined, Connection>; // undefined key means no workspace root

	private readonly _onConnected = this._register(
		new vscode.EventEmitter<ConnectionInfo>()
	);

	/**
	 * Fires when a new connection connects
	 */
	public readonly onConnected = this._onConnected.event;

	constructor() {
		super();

		this._initHttpPort = SettingUtil.GetConfig().portNumber;
		this._initWSPort = this._initHttpPort + 1;
		this._initHost = SettingUtil.GetConfig().hostIP;

		if (!this._validHost(this._initHost)) {
			this._showIncorrectHostFormatError(this._initHost);
			this._initHost = DEFAULT_HOST;
		} else if (vscode.env.remoteName && this._initHost != DEFAULT_HOST) {
			vscode.window.showErrorMessage(
				vscode.l10n.t(
					'Cannot use the host "{0}" when using a remote connection. Using default {1}.',
					this._initHost,
					DEFAULT_HOST
				)
			);
			this._initHost = DEFAULT_HOST;
		}

		this._connections = new Map<string, Connection>();

		this._register(
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration(SETTINGS_SECTION_ID)) {
					this._pendingPort = SettingUtil.GetConfig().portNumber;
					this._pendingHost = SettingUtil.GetConfig().hostIP;
				}
			})
		);
	}


	/**
	 * get connection by workspaceFolder
	 * @param workspaceFolder
	 * @returns connection
	 */
	public getConnection(
		workspaceFolder: vscode.WorkspaceFolder | undefined
	): Connection | undefined {
		return this._connections.get(workspaceFolder?.uri.toString());
	}

	/**
	 * get a connection using its current port number
	 * @param port
	 * @returns connection
	 */
	public getConnectionFromPort(port: number): Connection | undefined {
		return this.connections.find((e) => e && e.httpPort === port);
	}

	/**
	 * create a connection via workspaceFolder
	 * @param workspaceFolder
	 * @returns connection
	 */
	public async createAndAddNewConnection(
		workspaceFolder: vscode.WorkspaceFolder | undefined,
	): Promise<Connection> {
		const serverRootPrefix = workspaceFolder ? await PathUtil.GetValidServerRootForWorkspace(workspaceFolder) : '';

		const connection = this._register(
			new Connection(
				workspaceFolder,
				serverRootPrefix,
				this._initHttpPort,
				this._initWSPort,
				this._initHost
			)
		);

		this._register(connection.onConnected((e) => this._onConnected.fire(e)));
		this._register(
			connection.onShouldResetInitHost((host) => (this._initHost = host))
		);
		this._connections.set(workspaceFolder?.uri.toString(), connection);
		return connection;
	}

	/**
	 * remove a connection by workspaceFolder
	 * @param workspaceFolder
	 */
	public removeConnection(
		workspaceFolder: vscode.WorkspaceFolder | undefined
	): void {
		this._connections.get(workspaceFolder?.uri.toString())?.dispose;
		this._connections.delete(workspaceFolder?.uri.toString());
	}

	/**
	 * get list of connections as array.
	 */
	public get connections(): Connection[] {
		return Array.from(this._connections.values());
	}

	/**
	 * @description If setting for the initial port is changed, change the port that servers try first
	 */
	private set _pendingPort(port: number) {
		this._initHttpPort = port;
		this._initWSPort = port + 1;
	}

	private set _pendingHost(host: string) {
		if (this._validHost(host)) {
			this._initHost = host;
		} else {
			this._showIncorrectHostFormatError(host);
			this._initHost = DEFAULT_HOST;
		}
	}

	private _validHost(host: string): boolean {
		return isIPv4(host);
	}

	private _showIncorrectHostFormatError(host: string): void {
		vscode.window.showErrorMessage(
			vscode.l10n.t(
				'The local IP address "{0}" is not formatted correctly. Using default {1}.',
				host,
				DEFAULT_HOST
			)
		);
	}
}
