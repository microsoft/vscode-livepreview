/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import sinon from 'sinon';
import vscode from 'vscode';
import { PreviewManager } from '../../editorPreview/previewManager';
import { ConnectionManager } from '../../connectionInfo/connectionManager';
import { Connection } from '../../connectionInfo/connection';
import { EndpointManager } from '../../infoManagers/endpointManager';
import { OUTPUT_CHANNEL_NAME } from '../../utils/constants';
import { SettingUtil } from '../../utils/settingsUtil';
import { ExternalBrowserUtils } from '../../utils/externalBrowserUtils';
import { MockTelemetryReporter } from './mocks/mockTelemetryReporter';
import { makeSetting, testWorkspaces } from './common';

describe('PreviewManager console lifecycle', () => {
	let sandbox: sinon.SinonSandbox;
	let manager: PreviewManager;
	let connections: ConnectionManager;
	let endpoints: EndpointManager;
	let connection: Connection;
	let createChannel: sinon.SinonStub;
	let channel: vscode.OutputChannel;
	let disposeChannel: sinon.SinonStub;

	beforeEach(async () => {
		sandbox = sinon.createSandbox();
		sandbox.stub(SettingUtil, 'GetConfig').returns(makeSetting({}));
		disposeChannel = sandbox.stub();
		channel = {
			name: OUTPUT_CHANNEL_NAME,
			append: sandbox.stub(),
			appendLine: sandbox.stub(),
			replace: sandbox.stub(),
			clear: sandbox.stub(),
			show: (): void => {},
			hide: sandbox.stub(),
			dispose: disposeChannel,
		};
		createChannel = sandbox.stub().returns(channel);
		sandbox.replace(vscode.window, 'createOutputChannel', createChannel);
		connections = new ConnectionManager();
		endpoints = new EndpointManager();
		connection = await connections.createAndAddNewConnection(testWorkspaces[0]);
		manager = new PreviewManager(
			vscode.Uri.joinPath(vscode.Uri.file(__dirname), '..', '..', '..'),
			new MockTelemetryReporter(),
			connections,
			endpoints,
			() => {}
		);
	});

	afterEach(() => {
		manager.currentPanel?.panel.dispose();
		manager.dispose();
		connections.dispose();
		endpoints.dispose();
		sandbox.restore();
	});

	it('does not create a console when the manager is constructed', () => {
		assert.ok(createChannel.notCalled);
	});

	it('does not create a console for the integrated browser', async () => {
		sandbox.stub(SettingUtil, 'shouldUseIntegratedBrowser').resolves(true);
		const openBrowser = sandbox.stub().resolves();
		sandbox.replace(vscode.commands, 'executeCommand', openBrowser);
		await manager.launchFileInEmbeddedPreview(undefined, connection);
		assert.ok(openBrowser.calledOnce);
		assert.ok(createChannel.notCalled);
		assert.strictEqual(manager.currentPanel, undefined);
	});

	it('does not create a console for an external browser', async () => {
		const openBrowser = sandbox.stub().resolves();
		sandbox.replace(ExternalBrowserUtils, 'openInBrowser', openBrowser);
		await manager.launchFileInExternalBrowser(false, connection);
		assert.ok(openBrowser.calledOnce);
		assert.ok(createChannel.notCalled);
	});

	it('creates one legacy console, reuses it, and disposes it with the manager', async () => {
		sandbox.stub(SettingUtil, 'shouldUseIntegratedBrowser').resolves(false);
		await manager.launchFileInEmbeddedPreview(undefined, connection);
		assert.ok(createChannel.calledOnceWithExactly(OUTPUT_CHANNEL_NAME));
		await manager.launchFileInEmbeddedPreview(undefined, connection);
		assert.ok(createChannel.calledOnce);

		const closed = new Promise<void>((resolve) =>
			manager.currentPanel!.onDispose(resolve)
		);
		manager.currentPanel!.panel.dispose();
		await closed;
		await manager.launchFileInEmbeddedPreview(undefined, connection);
		assert.ok(createChannel.calledOnce);
		assert.ok(disposeChannel.notCalled);
		manager.dispose();
		assert.ok(disposeChannel.calledOnce);
	});
});
