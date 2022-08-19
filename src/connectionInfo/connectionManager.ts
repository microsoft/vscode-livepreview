import { isIPv4 } from 'net';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { DEFAULT_HOST } from '../utils/constants';
import { Disposable } from '../utils/dispose';
import { SETTINGS_SECTION_ID, SettingUtil } from '../utils/settingsUtil';
import { Connection, ConnectionInfo } from './connection';

/**
 * @description the instance that keeps track of the host and port information for the http and websocket servers.
 * Upon requesting the host, it will resolve its external URI before returning it.
 */
const localize = nls.loadMessageBundle();
export class ConnectionManager extends Disposable {
	private _initHttpPort;
	private _initWSPort;
	private _initHost: string;
	private _connections: Map<vscode.Uri | undefined, Connection>; // undefined key means no workspace root

	// private _nextPortToUse
	constructor(private readonly _extensionUri: vscode.Uri) {
		super();

		this._initHttpPort = SettingUtil.GetConfig(this._extensionUri).portNumber;
		this._initWSPort = this._initHttpPort + 1;
		this._initHost = SettingUtil.GetConfig(this._extensionUri).hostIP;

		if (!this._validHost(this._initHost)) {
			this.showIncorrectHostFormatError(this._initHost);
			this._initHost = DEFAULT_HOST;
		} else if (
			vscode.env.remoteName &&
			vscode.env.remoteName != '' &&
			this._initHost != DEFAULT_HOST
		) {
			vscode.window.showErrorMessage(
				localize(
					'hostCannotConnect',
					'Cannot use the host "{0}" when using a remote connection. Using default {1}.',
					this._initHost,
					DEFAULT_HOST
				)
			);
			this._initHost = DEFAULT_HOST;
		}

		this._connections = new Map<vscode.Uri, Connection>();

		this._register(
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration(SETTINGS_SECTION_ID)) {
					this.pendingPort = SettingUtil.GetConfig(
						this._extensionUri
					).portNumber;
					this.pendingHost = SettingUtil.GetConfig(this._extensionUri).hostIP;
				}
			})
		);
	}

	/**
	 * @description If setting for the initial port is changed, then the initial port is changed for the next server run.
	 */
	private set pendingPort(port: number) {
		this._initHttpPort = port;
		this._initWSPort = port + 1;
	}

	private set pendingHost(host: string) {
		if (this._validHost(host)) {
			this._initHost = host;
		} else {
			this.showIncorrectHostFormatError(host);
			this._initHost = DEFAULT_HOST;
		}
	}

	private _validHost(host: string) {
		return isIPv4(host);
	}

	private showIncorrectHostFormatError(host: string) {
		vscode.window.showErrorMessage(
			localize(
				'ipAddressIncorrectFormat',
				'The local IP address "{0}" is not formatted correctly. Using default {1}.',
				host,
				DEFAULT_HOST
			)
		);
	}
	private readonly _onConnected = this._register(
		new vscode.EventEmitter<ConnectionInfo>()
	);

	public readonly onConnected = this._onConnected.event;

	public getConnectionFromPort(port: number) {
		return this.connections.find((e) => e && e.httpPort === port);
	}

	public createAndAddNewConnection(
		workspaceFolder: vscode.WorkspaceFolder | undefined
	) {
		const connection = new Connection(
			workspaceFolder,
			this._initHttpPort,
			this._initWSPort,
			this._initHost
		);

		connection.onConnected((e) => this._onConnected.fire(e));
		connection.onShouldResetInitHost((host) => (this._initHost = host));
		this._connections.set(workspaceFolder?.uri, connection);
		return connection;
	}

	public removeConnection(workspaceFolder: vscode.WorkspaceFolder | undefined) {
		this._connections.get(workspaceFolder?.uri)?.dispose;
		this._connections.delete(workspaceFolder?.uri);
	}

	public getConnection(workspaceFolder: vscode.WorkspaceFolder | undefined) {
		return this._connections.get(workspaceFolder?.uri);
	}

	public get connections() {
		return Array.from(this._connections.values());
	}
}
