/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as path from 'path';
import sinon from 'sinon';
import vscode from 'vscode';
import { PreviewManager } from '../../editorPreview/previewManager';
import { MockTelemetryReporter } from './mocks/mockTelemetryReporter';
import { ConnectionManager } from '../../connectionInfo/connectionManager';
import { EndpointManager } from '../../infoManagers/endpointManager';
import { CustomExternalBrowser, SettingUtil } from '../../utils/settingsUtil';
import { makeSetting, testWorkspaces } from './common';
import { Connection } from '../../connectionInfo/connection';
import { WebviewComm } from '../../editorPreview/webviewComm';
import { ExternalBrowserUtils } from '../../utils/externalBrowserUtils';
import { INTEGRATED_BROWSER_COMMAND } from '../../utils/constants';

describe('PreviewManager', () => {
	let sandbox: sinon.SinonSandbox;
	let previewManager: PreviewManager;
	let endpointManager: EndpointManager;
	let connection: Connection;

	const init = async (): Promise<void> => {
		sandbox = sinon.createSandbox();
		sandbox.stub(SettingUtil, 'GetConfig').returns(makeSetting({}));
	};

	before(async () => {
		await init();
		const extensionUri = vscode.Uri.file('c:/Users/TestUser/vscode-livepreview/');

		const telemetryReporter = new MockTelemetryReporter();
		const connectionManager = new ConnectionManager();
		connection = await connectionManager.createAndAddNewConnection(testWorkspaces[0]);
		endpointManager = new EndpointManager();

		previewManager = new PreviewManager(
			extensionUri,
			telemetryReporter,
			connectionManager,
			endpointManager,
			() => {
				// noop
			}
		);

	});

	after(async () => {
		await previewManager.currentPanel?.panel.dispose();
		previewManager.dispose();
		sandbox.restore();
	});

	afterEach(() => {
		// Restore the original tests' default-sandbox spies before the route tests spy on the same methods.
		sinon.restore();
	});

	it("previews in embedded preview", async () => {
		const goToFile = sinon.spy(WebviewComm.prototype, 'goToFile');

		await previewManager.launchFileInEmbeddedPreview(undefined, connection,
			testWorkspaces[0].uri);
		const initialPanel = previewManager.currentPanel?.panel;
		await previewManager.launchFileInEmbeddedPreview(undefined, connection,
			vscode.Uri.joinPath(testWorkspaces[0].uri, "/index.html"));
		await previewManager.launchFileInEmbeddedPreview(undefined, connection,
			vscode.Uri.joinPath(testWorkspaces[0].uri, "/index.html"));
		await previewManager.launchFileInEmbeddedPreview(undefined, connection,
			vscode.Uri.joinPath(testWorkspaces[0].uri, "/page.html"));

		assert(previewManager.currentPanel?.panel === initialPanel); // ensure that the same panel was used the entire time
		assert.ok(goToFile.callCount === 4);
		assert(previewManager.previewActive);

		assert.ok(goToFile.getCall(0).calledWith('/', false));
		assert.ok(goToFile.getCall(1).calledWith('/index.html', true));
		assert.ok(goToFile.getCall(2).calledWith('/index.html', true));
		assert.ok(goToFile.getCall(3).calledWith('/page.html', true));
	});

	it("previews in external preview (non-debug)", async () => {
		const openInBrowser = sinon.stub(ExternalBrowserUtils, 'openInBrowser');

		await previewManager.launchFileInExternalBrowser(false, connection,
			vscode.Uri.joinPath(testWorkspaces[0].uri, "/index.html"));

		assert.ok(openInBrowser.calledOnce);
		assert.ok(openInBrowser.getCall(0).calledWith(`http://${connection.host}:${connection.httpPort}/index.html`, CustomExternalBrowser.edge));
	});

	it("previews in external preview (debug)", async () => {
		const executeCommand = sinon.stub(vscode.commands, 'executeCommand');

		await previewManager.launchFileInExternalBrowser(true, connection,
			vscode.Uri.joinPath(testWorkspaces[0].uri, "/index.html"));

		assert.ok(executeCommand.calledOnce);
		assert.ok(executeCommand.getCall(0).calledWith('extension.js-debug.debugLink', `http://${connection.host}:${connection.httpPort}/index.html`));
	});

	// Derive the filesystem root so this case covers both POSIX roots and Windows drive roots.
	const rootWorkspace: vscode.WorkspaceFolder = {
		uri: vscode.Uri.file(path.parse(testWorkspaces[0].uri.fsPath).root),
		name: 'Filesystem root',
		index: 0,
	};
	// Exercise each root shape through all four launch routes; 'public' is the non-trailing-slash control.
	for (const { name, workspace, serverRoot } of [
		{ name: 'filesystem root workspace', workspace: rootWorkspace, serverRoot: '' },
		{ name: 'trailing server-root separator', workspace: testWorkspaces[0], serverRoot: 'public/' },
		{ name: 'server root without a trailing separator', workspace: testWorkspaces[0], serverRoot: 'public' },
	]) {
		for (const mode of ['integrated', 'external', 'debug', 'legacy'] as const) {
			it(`opens ${mode} preview with a ${name}`, async () => {
				const routeSandbox = sinon.createSandbox();
				const routeConnection = new Connection(workspace, serverRoot, 3000, 3001, '127.0.0.1');
				const file = vscode.Uri.joinPath(routeConnection.rootURI!, 'index.html');
				const url = 'http://127.0.0.1:3000/index.html';
				try {
					routeSandbox.stub(SettingUtil, 'shouldUseIntegratedBrowser').resolves(mode === 'integrated');
					if (mode === 'integrated' || mode === 'debug') {
						const executeCommand = routeSandbox.stub(vscode.commands, 'executeCommand');
						if (mode === 'integrated') {
							await previewManager.launchFileInEmbeddedPreview(undefined, routeConnection, file);
							assert.ok(executeCommand.calledOnceWithExactly(INTEGRATED_BROWSER_COMMAND, {
								url: `${url}?vscode-livepreview=true`,
								openToSide: true,
								reuseUrlFilter: '**?vscode-livepreview=true',
							}));
						} else {
							await previewManager.launchFileInExternalBrowser(true, routeConnection, file);
							assert.ok(executeCommand.calledOnceWithExactly('extension.js-debug.debugLink', url));
						}
					} else if (mode === 'external') {
						const openInBrowser = routeSandbox.stub(ExternalBrowserUtils, 'openInBrowser');
						await previewManager.launchFileInExternalBrowser(false, routeConnection, file);
						assert.ok(openInBrowser.calledOnceWithExactly(url, CustomExternalBrowser.edge));
					} else {
						// Legacy webviews receive the rooted path through WebviewComm rather than a browser URL.
						const goToFile = routeSandbox.spy(WebviewComm.prototype, 'goToFile');
						await previewManager.launchFileInEmbeddedPreview(undefined, routeConnection, file);
						assert.ok(goToFile.calledOnceWithExactly('/index.html', true, routeConnection));
					}
				} finally {
					routeSandbox.restore();
					routeConnection.dispose();
				}
			});
		}
	}
});
