/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
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

		assert.strictEqual(goToFile.getCall(0).args[0], '');
		assert.strictEqual(goToFile.getCall(0).args[1], false);
		assert.strictEqual(goToFile.getCall(1).args[0], '/index.html');
		assert.strictEqual(goToFile.getCall(1).args[1], true);
		assert.strictEqual(goToFile.getCall(2).args[0], '/index.html');
		assert.strictEqual(goToFile.getCall(2).args[1], true);
		assert.strictEqual(goToFile.getCall(3).args[0], '/page.html');
		assert.strictEqual(goToFile.getCall(3).args[1], true);
	});

	it("previews in external preview (non-debug)", async () => {
		const openInBrowser = sinon.stub(ExternalBrowserUtils, 'openInBrowser');

		await previewManager.launchFileInExternalBrowser(false, connection,
			vscode.Uri.joinPath(testWorkspaces[0].uri, "/index.html"));

		assert.ok(openInBrowser.calledOnce);
		assert.strictEqual(openInBrowser.getCall(0).args[0], `http://${connection.host}:${connection.httpPort}/index.html`);
		assert.strictEqual(openInBrowser.getCall(0).args[1], CustomExternalBrowser.edge);
	});

	it("previews in external preview (debug)", async () => {
		const executeCommand = sinon.stub(vscode.commands, 'executeCommand');

		await previewManager.launchFileInExternalBrowser(true, connection,
			vscode.Uri.joinPath(testWorkspaces[0].uri, "/index.html"));

		assert.ok(executeCommand.calledOnce);
		assert.strictEqual(executeCommand.getCall(0).args[0], 'extension.js-debug.debugLink');
		assert.strictEqual(executeCommand.getCall(0).args[1], `http://${connection.host}:${connection.httpPort}/index.html`);
	});

	it("previews files with special characters in path", async () => {
		const goToFile = sinon.spy(WebviewComm.prototype, 'goToFile');

		// Test file with spaces and hash characters
		const fileUri = vscode.Uri.joinPath(
			testWorkspaces[0].uri,
			'special #01 folder',
			'test #01 file.html'
		);

		await previewManager.launchFileInEmbeddedPreview(undefined, connection, fileUri);

		assert.ok(goToFile.callCount >= 1);

		// Verify the path passed to goToFile is properly encoded
		const pathArgument = goToFile.getCall(goToFile.callCount - 1).args[0];
		assert.ok(pathArgument.includes('%20'), 'Spaces should be URL-encoded');
		assert.ok(pathArgument.includes('%23'), 'Hash symbols should be URL-encoded');
		assert.strictEqual(
			pathArgument,
			'/special%20%2301%20folder/test%20%2301%20file.html'
		);
	});
});