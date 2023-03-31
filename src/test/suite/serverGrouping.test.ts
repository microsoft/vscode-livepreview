/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../connectionInfo/connectionManager';
import { PathUtil } from '../../utils/pathUtil';
import { Stats } from 'fs';
import { makeSetting, testWorkspaces } from './common';
import { SettingUtil } from '../../utils/settingsUtil';
import { ServerGrouping } from '../../server/serverGrouping';
import { MockTelemetryReporter } from './mocks/mockTelemetryReporter';
import { EndpointManager } from '../../infoManagers/endpointManager';
import { ServerTaskProvider } from '../../task/serverTaskProvider';
import * as fs from 'fs';
import * as http from 'http';
import { INJECTED_ENDPOINT_NAME } from '../../utils/constants';
import { ContentLoader } from '../../server/serverUtils/contentLoader';


describe('ServerGrouping', () => {
	let sandbox: sinon.SinonSandbox;
	let serverGrouping: ServerGrouping;
	let connection;
	before(async () => {
		sandbox = sinon.createSandbox();
		sandbox.stub(vscode.env, 'asExternalUri').callsFake((uri) => Promise.resolve(uri));
		sandbox.stub(SettingUtil, 'GetConfig').returns(makeSetting({ serverRoot: 'test' }));

		const existingDirectories = [
			'c:/Users/TestUser/workspace1/test/',
			'c:/Users/TestUser/workspace1/test/path',
			'c:/Users/TestUser/workspace1/test/path/',
		];
		const existingPaths = [
			'c:/Users/TestUser/workspace1/test',
			'c:/Users/TestUser/workspace1/test/',
			'c:/Users/TestUser/workspace1/test/path',
			'c:/Users/TestUser/workspace1/test/path/',
			'c:/Users/TestUser/workspace1/test/index.html'
		];

		sandbox.stub(PathUtil, 'FileExistsStat').callsFake((path: string) => {
			const stats = new Stats();
			sandbox.stub(stats, 'isDirectory').callsFake(() => {
				return existingDirectories.indexOf(PathUtil.ConvertToPosixPath(path)) > -1;
			});
			if (existingPaths.indexOf(PathUtil.ConvertToPosixPath(path)) > -1) {
				return Promise.resolve({ exists: true, stat: stats });
			}
			return Promise.resolve({ exists: false, stat: new Stats() });
		});

		sandbox.stub(fs, 'readFileSync').callsFake((path, _) => {
			return `contents from ${PathUtil.ConvertToPosixPath(path as string)}`;
		});

		sandbox.stub(PathUtil, 'FileRead').callsFake((file) => {
			return Promise.resolve(`file contents from ${PathUtil.ConvertToPosixPath(file)}`);
		});

		sandbox.stub(ContentLoader.prototype, <any>'fsReadDir').returns(Promise.resolve([])); // fsReadDir is private, so it is casted to any

		const connectionManager = new ConnectionManager();
		connection = await connectionManager.createAndAddNewConnection(testWorkspaces[0]);
		const endpointManager = new EndpointManager();
		const telemetryReporter = new MockTelemetryReporter();
		const extensionUri = vscode.Uri.file('c:/Users/TestUser/vscode-livepreview/');

		serverGrouping = new ServerGrouping(
			extensionUri,
			telemetryReporter,
			endpointManager,
			connection,
			new ServerTaskProvider(telemetryReporter, endpointManager, connectionManager),
			new Set()
		);
	});

	after(() => {
		sandbox.restore();
	});

	it('should start a server when openServer is called ', async () => {
		assert(!serverGrouping.isRunning);
		await serverGrouping.openServer();
		assert(serverGrouping.isRunning);
	});

	it('should have a reachable index.html', async () => {
		return new Promise<void>((resolve, reject) => {
			let str = '';
			http.get({ host: "127.0.0.1", port: serverGrouping.connection.httpPort, path: "/index.html" }, function (res) {
				assert.equal(res.statusCode, 200);
				res.on('data', function (data) {
					str += data;
				});

				res.on('end', function () {
					assert.equal(str, `<script type="text/javascript" src="${INJECTED_ENDPOINT_NAME}"></script>file contents from c:/Users/TestUser/workspace1/test/index.html`);
					resolve();
				});
			});
		});
	});


	it('should navigate to index.html when reaching index ', async () => {
		return new Promise<void>((resolve, reject) => {
			let str = '';
			http.get({ host: "127.0.0.1", port: serverGrouping.connection.httpPort, path: "" }, function (res) {
				assert.equal(res.statusCode, 200);
				res.on('data', function (data) {
					str += data;
				});

				res.on('end', function () {
					assert.equal(str, `<script type="text/javascript" src="${INJECTED_ENDPOINT_NAME}"></script>file contents from c:/Users/TestUser/workspace1/test/index.html`);
					resolve();
				});
			});
		});
	});

	it('should navigate to a directory index if there is no index.html', async () => {
		return new Promise<void>((resolve, reject) => {
			let str = '';
			http.get({ host: "127.0.0.1", port: serverGrouping.connection.httpPort, path: "/path/" }, function (res) {
				assert.equal(res.statusCode, 200);
				res.on('data', function (data) {
					str += data;
				});

				res.on('end', function () {
					assert(str.indexOf('Index of /path/') > -1);
					assert(str.indexOf('<th>Name</th><th>Size</th><th>Date Modified</th>') > -1);
					assert(str.indexOf('<td><a href="../">../</a></td>') > -1);
					assert(str.indexOf('<script type="text/javascript" src="/___vscode_livepreview_injected_script"></script>') > -1);
					resolve();
				});
			});
		});
	});

	it('should hit 404 if the file does not exist', async () => {
		return new Promise<void>((resolve, reject) => {
			let str = '';
			http.get({ host: "127.0.0.1", port: serverGrouping.connection.httpPort, path: "/path/eep.html" }, function (res) {
				assert.equal(res.statusCode, 404);
				res.on('data', function (data) {
					str += data;
				});

				res.on('end', function () {
					assert(str.indexOf('File not found') > -1);
					resolve();
				});
			});
		});
	});

	it('should hit 302 path does not end in forward slash but is directory', async () => {
		return new Promise<void>((resolve, reject) => {
			http.get({ host: "127.0.0.1", port: serverGrouping.connection.httpPort, path: "/path" }, function (res) {
				assert.equal(res.statusCode, 302);
				assert.equal(res.headers.location, '/path/');
				resolve();
			});
		});
	});

	it('should close the server when closeServer is called ', async () => {
		const dispose = sinon.spy(serverGrouping.connection, 'dispose');
		const closeSuccessful = serverGrouping.closeServer();
		assert(closeSuccessful);
		assert(!serverGrouping.isRunning);
		assert.ok(dispose.calledOnce);
	});
});
