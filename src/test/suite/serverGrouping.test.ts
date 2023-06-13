/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import sinon from 'sinon';
import fs from 'fs';
import http from 'http';
import vscode from 'vscode';
import { ConnectionManager } from '../../connectionInfo/connectionManager';
import { PathUtil } from '../../utils/pathUtil';
import { makeSetting, testWorkspaces } from './common';
import { SettingUtil } from '../../utils/settingsUtil';
import { ServerGrouping } from '../../server/serverGrouping';
import { MockTelemetryReporter } from './mocks/mockTelemetryReporter';
import { EndpointManager } from '../../infoManagers/endpointManager';
import { ServerTaskProvider } from '../../task/serverTaskProvider';
import { INJECTED_ENDPOINT_NAME } from '../../utils/constants';
import { ContentLoader } from '../../server/serverUtils/contentLoader';
import { Connection } from '../../connectionInfo/connection';


describe('ServerGrouping', () => {
	let sandbox: sinon.SinonSandbox;
	let telemetryReporter: MockTelemetryReporter;
	const init = async (): Promise<void> => {
		sandbox = sinon.createSandbox();
		sandbox.stub(vscode.env, 'asExternalUri').callsFake((uri) => Promise.resolve(uri));
		sandbox.stub(SettingUtil, 'GetConfig').returns(makeSetting({ serverRoot: 'test' }));

		const existingDirectories = [
			'c:/Users/TestUser/workspace1/test',
			'c:/Users/TestUser/workspace1/test/',
			'c:/Users/TestUser/workspace1/test/path',
			'c:/Users/TestUser/workspace1/test/path/',

			'c:/Users/TestUser/workspace2/test',
			'c:/Users/TestUser/workspace2/test/',
			'c:/Users/TestUser/workspace2/test/path',
			'c:/Users/TestUser/workspace2/test/path/',
		];

		const existingPaths = [
			'c:/Users/TestUser/workspace1/test',
			'c:/Users/TestUser/workspace1/test/',
			'c:/Users/TestUser/workspace1/test/path',
			'c:/Users/TestUser/workspace1/test/path/',
			'c:/Users/TestUser/workspace1/test/index.html',

			'c:/Users/TestUser/workspace2/test',
			'c:/Users/TestUser/workspace2/test/',
			'c:/Users/TestUser/workspace2/test/path',
			'c:/Users/TestUser/workspace2/test/path/',
			'c:/Users/TestUser/workspace2/test/index.html'
		];

		sandbox.stub(PathUtil, 'FileExistsStat').callsFake((path: string) => {
			const stats = new fs.Stats();
			sandbox.stub(stats, 'isDirectory').callsFake(() => {
				return existingDirectories.indexOf(PathUtil.ConvertToPosixPath(path)) > -1;
			});
			if (existingPaths.indexOf(PathUtil.ConvertToPosixPath(path)) > -1) {
				return Promise.resolve({ exists: true, stat: stats });
			}
			return Promise.resolve({ exists: false, stat: new fs.Stats() });
		});

		sandbox.stub(fs, 'readFileSync').callsFake((path, _) => {
			return `contents from ${PathUtil.ConvertToPosixPath(path as string)}`;
		});

		sandbox.stub(PathUtil, 'FileRead').callsFake((file) => {
			return Promise.resolve(`file contents from ${PathUtil.ConvertToPosixPath(file)}`);
		});

		sandbox.stub(ContentLoader.prototype, <any>'fsReadDir').returns(Promise.resolve([])); // fsReadDir is private, so it is casted to any
		telemetryReporter = new MockTelemetryReporter();
	};

	const getIndexHTML = (port: number | undefined, openAtAddr?: string, workspaceNum = 1): Promise<void> => {
		return new Promise<void>((resolve, reject) => {
			let str = '';
			http.get({ host: "127.0.0.1", port: port, path: `/${openAtAddr === undefined ? '' : openAtAddr}index.html` }, function (res) {
				assert.equal(res.statusCode, 200);
				res.on('data', function (data) {
					str += data;
				});

				res.on('end', function () {
					assert.equal(str, `<script type="text/javascript" src="${INJECTED_ENDPOINT_NAME}"></script>file contents from c:/Users/TestUser/workspace${workspaceNum}/test/index.html`);
					resolve();
				});
			});
		});
	};

	const getDirWithIndexHTML = (port: number | undefined, openAtAddr?: string, workspaceNum = 1): Promise<void> => {
		return new Promise<void>((resolve, reject) => {
			let str = '';
			http.get({ host: "127.0.0.1", port: port, path: `${openAtAddr === undefined ? '' : `/${openAtAddr}/`}` }, function (res) {
				assert.equal(res.statusCode, 200);
				res.on('data', function (data) {
					str += data;
				});

				res.on('end', function () {
					assert.equal(str, `<script type="text/javascript" src="${INJECTED_ENDPOINT_NAME}"></script>file contents from c:/Users/TestUser/workspace${workspaceNum}/test/index.html`);
					resolve();
				});
			});
		});
	};

	const getDirWithoutIndexHTML = (port: number | undefined, openAtAddr?: string): Promise<void> => {
		return new Promise<void>((resolve, reject) => {
			let str = '';
			http.get({ host: "127.0.0.1", port: port, path: `/${openAtAddr === undefined ? '' : openAtAddr}path/` }, function (res) {
				assert.equal(res.statusCode, 200);
				res.on('data', function (data) {
					str += data;
				});

				res.on('end', function () {
					assert(str.indexOf('Index of /path/') > -1 || str.indexOf('Index of path') > -1);
					assert(str.indexOf('<th>Name</th><th>Size</th><th>Date Modified</th>') > -1);
					assert(str.indexOf('<td><a href="../">../</a></td>') > -1);
					assert(str.indexOf('<script type="text/javascript" src="/___vscode_livepreview_injected_script"></script>') > -1);
					resolve();
				});
			});
		});
	};


	const get404 = (port: number | undefined, openAtAddr?: string): Promise<void> => {
		return new Promise<void>((resolve, reject) => {
			let str = '';
			http.get({ host: "127.0.0.1", port: port, path: `/${openAtAddr === undefined ? '' : openAtAddr}path/eep.html` }, function (res) {
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
	};


	const get302 = (port: number | undefined, openAtAddr?: string, workspaceNum = 1): Promise<void> => {
		return new Promise<void>((resolve, reject) => {
			http.get({ host: "127.0.0.1", port: port, path: `/${openAtAddr === undefined ? '' : openAtAddr}path` }, function (res) {
				assert.equal(res.statusCode, 302);
				assert.equal(res.headers.location, openAtAddr === undefined ? '/path/' : `/c:/Users/TestUser/workspace${workspaceNum}/test/path/`);
				resolve();
			});
		});
	};

	describe("With a workspace", () => {
		let serverGrouping: ServerGrouping;
		let connection: Connection;
		let connectionManager: ConnectionManager;
		let endpointManager: EndpointManager;
		let serverTaskProvider: ServerTaskProvider;
		before(async () => {
			await init();
			connectionManager = new ConnectionManager();
			connection = await connectionManager.createAndAddNewConnection(testWorkspaces[0]);
			endpointManager = new EndpointManager();
			serverTaskProvider = new ServerTaskProvider(telemetryReporter, endpointManager, connectionManager);
			const extensionUri = vscode.Uri.file('c:/Users/TestUser/vscode-livepreview/');

			serverGrouping = new ServerGrouping(
				extensionUri,
				telemetryReporter,
				endpointManager,
				connection,
				serverTaskProvider,
				new Set()
			);
		});

		after(async () => {
			if (serverGrouping.isRunning) {
				serverGrouping.closeServer();
			}
			serverGrouping.dispose();
			connectionManager.dispose();
			endpointManager.dispose();
			serverTaskProvider.dispose();
			telemetryReporter.dispose();

			sandbox.restore();
		});

		it('should start a server when openServer is called ', async () => {
			assert(!serverGrouping.isRunning);
			await serverGrouping.openServer();
			assert(serverGrouping.isRunning);
		});

		it('should have a reachable index.html', async () => {
			return getIndexHTML(serverGrouping.port);
		});

		it('should navigate to index.html when reaching index ', async () => {
			return getDirWithIndexHTML(serverGrouping.port);
		});

		it('should navigate to a directory index if there is no index.html', async () => {
			return getDirWithoutIndexHTML(serverGrouping.port);
		});

		it('should hit 404 if the file does not exist', async () => {
			return get404(serverGrouping.port);
		});

		it('should hit 302 path does not end in forward slash but is directory', async () => {
			return get302(serverGrouping.port);
		});

		it('should close the server when closeServer is called ', async () => {
			const dispose = sinon.spy(serverGrouping.connection, 'dispose');
			const closeSuccessful = serverGrouping.closeServer();
			assert(closeSuccessful);
			assert(!serverGrouping.isRunning);
			assert.ok(dispose.calledOnce);
		});
	});

	describe("Without workspace", () => {
		let serverGrouping: ServerGrouping;
		let connection: Connection;
		let connectionManager: ConnectionManager;
		let endpointManager: EndpointManager;
		let serverTaskProvider: ServerTaskProvider;
		let openAtAddr: string;
		before(async () => {
			await init();
			connectionManager = new ConnectionManager();
			connection = await connectionManager.createAndAddNewConnection(undefined);
			endpointManager = new EndpointManager();
			serverTaskProvider = new ServerTaskProvider(telemetryReporter, endpointManager, connectionManager);
			const extensionUri = vscode.Uri.file('c:/Users/TestUser/vscode-livepreview/');

			serverGrouping = new ServerGrouping(
				extensionUri,
				telemetryReporter,
				endpointManager,
				connection,
				serverTaskProvider,
				new Set()
			);
			openAtAddr = await endpointManager.encodeLooseFileEndpoint("c:/Users/TestUser/workspace1/test");
		});

		after(async () => {
			if (serverGrouping.isRunning) {
				serverGrouping.closeServer();
			}
			serverGrouping.dispose();
			connectionManager.dispose();
			endpointManager.dispose();
			serverTaskProvider.dispose();
			telemetryReporter.dispose();
			sandbox.restore();
		});

		it('should start a server when openServer is called ', async () => {
			assert(!serverGrouping.isRunning);
			await serverGrouping.openServer();
			assert(serverGrouping.isRunning);
		});

		it('should have a reachable index.html', async () => {
			return getIndexHTML(serverGrouping.port, openAtAddr);
		});

		it('should navigate to index.html when reaching index ', async () => {
			return getDirWithIndexHTML(serverGrouping.port, openAtAddr);
		});

		it('should navigate to a directory index if there is no index.html', async () => {
			return getDirWithoutIndexHTML(serverGrouping.port, openAtAddr);
		});

		it('should hit 404 if the file does not exist', async () => {
			return get404(serverGrouping.port, openAtAddr);
		});

		it('should hit 302 path does not end in forward slash but is directory', async () => {

			return get302(serverGrouping.port, openAtAddr);
		});

		it('should inform the user that there is no server root if they try to go to root', async () => {
			return new Promise<void>((resolve, reject) => {
				let str = '';
				http.get({ host: "127.0.0.1", port: serverGrouping.port, path: `/` }, function (res) {
					assert.equal(res.statusCode, 404);
					res.on('data', function (data) {
						str += data;
					});

					res.on('end', function () {
						assert(str.indexOf('No Server Root') > -1);
						resolve();
					});
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

	describe("Two workspaces", () => {

		let serverGrouping1: ServerGrouping;
		let serverGrouping2: ServerGrouping;
		let connection1: Connection;
		let connection2: Connection;
		let connectionManager: ConnectionManager;
		let endpointManager: EndpointManager;
		let serverTaskProvider: ServerTaskProvider;
		before(async () => {
			await init();
			connectionManager = new ConnectionManager();
			connection1 = await connectionManager.createAndAddNewConnection(testWorkspaces[0]);
			connection2 = await connectionManager.createAndAddNewConnection(testWorkspaces[1]);
			endpointManager = new EndpointManager();
			serverTaskProvider = new ServerTaskProvider(telemetryReporter, endpointManager, connectionManager);
			const extensionUri = vscode.Uri.file('c:/Users/TestUser/vscode-livepreview/');

			serverGrouping1 = new ServerGrouping(
				extensionUri,
				telemetryReporter,
				endpointManager,
				connection1,
				serverTaskProvider,
				new Set()
			);
			serverGrouping2 = new ServerGrouping(
				extensionUri,
				telemetryReporter,
				endpointManager,
				connection2,
				serverTaskProvider,
				new Set()
			);
		});

		after(async () => {
			if (serverGrouping1.isRunning) {
				serverGrouping1.closeServer();
			}
			if (serverGrouping2.isRunning) {
				serverGrouping2.closeServer();
			}
			connectionManager.dispose();
			endpointManager.dispose();
			serverTaskProvider.dispose();
			telemetryReporter.dispose();
			sandbox.restore();
		});

		it('should start a server when openServer is called ', async () => {
			assert(!serverGrouping1.isRunning);
			await serverGrouping1.openServer();
			assert(serverGrouping1.isRunning);

			assert(!serverGrouping2.isRunning);
			await serverGrouping2.openServer();
			assert(serverGrouping2.isRunning);

			assert(serverGrouping1.port !== serverGrouping2.port);
			assert(connection1.wsPort !== connection2.wsPort);
		});


		it('should have a reachable index.html in both cases', async () => {
			return Promise.all([
				getIndexHTML(serverGrouping1.port, undefined, 1),
				getIndexHTML(serverGrouping2.port, undefined, 2),
			]);
		});

		it('should navigate to index.html when reaching index in both cases', async () => {
			return Promise.all([
				getDirWithIndexHTML(serverGrouping1.port, undefined, 1),
				getDirWithIndexHTML(serverGrouping2.port, undefined, 2),
			]);
		});

		it('should navigate to a directory index if there is no index.html in both cases', async () => {
			return Promise.all([
				getDirWithoutIndexHTML(serverGrouping1.port, undefined),
				getDirWithoutIndexHTML(serverGrouping2.port, undefined),
			]);
		});

		it('should hit 404 if the file does not exist in both cases', async () => {
			return Promise.all([
				get404(serverGrouping1.port),
				get404(serverGrouping2.port),
			]);
		});

		it('should hit 302 path does not end in forward slash but is directory in both cases', async () => {
			return Promise.all([
				get302(serverGrouping1.port, undefined, 1),
				get302(serverGrouping2.port, undefined, 2),
			]);
		});

		it('should close the server when closeServer is called in both cases', async () => {
			const dispose1 = sinon.spy(serverGrouping1.connection, 'dispose');
			const closeSuccessful1 = serverGrouping1.closeServer();
			assert(closeSuccessful1);
			assert(!serverGrouping1.isRunning);
			assert.ok(dispose1.calledOnce);

			const dispose2 = sinon.spy(serverGrouping2.connection, 'dispose');
			const closeSuccessful2 = serverGrouping2.closeServer();
			assert(closeSuccessful2);
			assert(!serverGrouping2.isRunning);
			assert.ok(dispose2.calledOnce);
		});
	});

	describe("Check that previewing will also open server", () => {
		let serverGrouping: ServerGrouping;
		let connection: Connection;
		before(async () => {
			await init();
			const connectionManager = new ConnectionManager();
			connection = await connectionManager.createAndAddNewConnection(testWorkspaces[0]);
			const endpointManager = new EndpointManager();
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

		after(async () => {
			if (serverGrouping.isRunning) {
				serverGrouping.closeServer();
			}
			sandbox.restore();
		});

		it("starts the server with createOrShowEmbeddedPreview", async () => {
			// not checking for actual preview, since that happens upon connection
			const open = sandbox.spy(serverGrouping, "openServer");
			const file = vscode.Uri.joinPath(testWorkspaces[0].uri, "/index.html");
			await serverGrouping.createOrShowEmbeddedPreview(undefined, file);
			assert.ok(open.calledOnce);
			assert(serverGrouping.isRunning);
			serverGrouping.closeServer();
			open.restore();
		});

		it("starts the server with showPreviewInExternalBrowser", async () => {
			const openSpy = sandbox.spy(serverGrouping, "openServer");
			const file = vscode.Uri.joinPath(testWorkspaces[0].uri, "/index.html");
			await serverGrouping.showPreviewInExternalBrowser(false, file);
			assert.ok(openSpy.calledOnce);
			assert(serverGrouping.isRunning);
			serverGrouping.closeServer();
			openSpy.restore();
		});
	});
});
