/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import sinon from 'sinon';
import vscode from 'vscode';
import fs from 'fs';
import { makeSetting, testWorkspaces } from './common';
import { ContentLoader } from '../../server/serverUtils/contentLoader';
import { PathUtil } from '../../utils/pathUtil';
import { ILivePreviewConfigItem, PreviewType, SettingUtil } from '../../utils/settingsUtil';
import { Manager } from '../../manager';
import { MockTelemetryReporter } from './mocks/mockTelemetryReporter';
import { ServerGrouping } from '../../server/serverGrouping';
import { ServerTaskProvider } from '../../task/serverTaskProvider';

describe("Manager", () => {
	let sandbox: sinon.SinonSandbox;
	let settingStub: sinon.SinonStub<[scope?: vscode.ConfigurationScope | undefined], ILivePreviewConfigItem>;
	let telemetryReporter: MockTelemetryReporter;
	const init = async (): Promise<void> => {
		sandbox = sinon.createSandbox();
		sandbox.stub(vscode.env, 'asExternalUri').callsFake((uri) => Promise.resolve(uri));

		const existingDirectories = [
			'c:/Users/TestUser/workspace1/test',
			'c:/Users/TestUser/workspace1/test/',
		];
		const existingPaths = [
			'c:/Users/TestUser/workspace1/test',
			'c:/Users/TestUser/workspace1/test/',
			'c:/Users/TestUser/workspace1/page.html',
			'C:/Users/TestUser/workspace1/page.html',
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

		sandbox.stub(PathUtil, 'FileRead').callsFake((file) => {
			return Promise.resolve(`file contents from ${PathUtil.ConvertToPosixPath(file)}`);
		});
		sandbox.stub(fs, 'readFileSync').callsFake((path, _) => {
			return `contents from ${PathUtil.ConvertToPosixPath(path as string)}`;
		});
		sandbox.stub(ContentLoader.prototype, <any>'fsReadDir').returns(Promise.resolve([])); // fsReadDir is private, so it is casted to any
	};

	let manager: Manager;
	before(async () => {
		await init();
		const extensionUri = vscode.Uri.file('c:/Users/TestUser/vscode-livepreview/');
		telemetryReporter = new MockTelemetryReporter();

		manager = new Manager(extensionUri, telemetryReporter, "test");
		sandbox.stub(vscode.workspace, 'workspaceFolders').value(testWorkspaces);
		settingStub = sandbox.stub(SettingUtil, 'GetConfig').returns(makeSetting({}));
	});

	after(() => {
		manager.dispose();
		telemetryReporter.dispose();
		sandbox.restore();
	});

	it('should create and use the correct serverGrouping for a file and open embedded preview', async () => {
		const getServerGroupingFromWorkspace = sandbox.spy(Manager.prototype, <any>"_getServerGroupingFromWorkspace");
		const createOrShowEmbeddedPreview = sandbox.stub(ServerGrouping.prototype, "createOrShowEmbeddedPreview");
		const file = vscode.Uri.joinPath(testWorkspaces[0].uri, "/index.html");
		await manager.openPreviewAtFileUri(file);

		assert(createOrShowEmbeddedPreview.calledOnce);
		assert(createOrShowEmbeddedPreview.calledWith(undefined, file));
		assert(getServerGroupingFromWorkspace.calledOnce);
		assert(getServerGroupingFromWorkspace.calledWith(testWorkspaces[0]));

		getServerGroupingFromWorkspace.restore();
		createOrShowEmbeddedPreview.restore();
	});

	it('should create and use the correct serverGrouping for a file and open external preview', async () => {
		const getServerGroupingFromWorkspace = sandbox.spy(Manager.prototype, <any>"_getServerGroupingFromWorkspace");
		const showPreviewInExternalBrowser = sandbox.stub(ServerGrouping.prototype, "showPreviewInExternalBrowser");
		const file = vscode.Uri.joinPath(testWorkspaces[0].uri, "/index.html");
		await manager.openPreviewAtFileUri(file, undefined, PreviewType.externalPreview);

		assert(showPreviewInExternalBrowser.calledOnce);
		assert(showPreviewInExternalBrowser.calledWith(false, file));
		assert(getServerGroupingFromWorkspace.calledOnce);
		assert(getServerGroupingFromWorkspace.calledWith(testWorkspaces[0]));

		getServerGroupingFromWorkspace.restore();
		showPreviewInExternalBrowser.restore();
	});

	it('should create and use the correct serverGrouping for a file (undefined workspace)', async () => {
		const getServerGroupingFromWorkspace = sandbox.spy(Manager.prototype, <any>"_getServerGroupingFromWorkspace");
		const createOrShowEmbeddedPreview = sandbox.stub(ServerGrouping.prototype, "createOrShowEmbeddedPreview");
		const file = vscode.Uri.file("c:/TestUser/workspace3/index.html");
		await manager.openPreviewAtFileUri(file);

		assert(createOrShowEmbeddedPreview.calledOnce);
		assert(createOrShowEmbeddedPreview.calledWith(undefined, file));
		assert(getServerGroupingFromWorkspace.calledOnce);
		assert(getServerGroupingFromWorkspace.calledWith(undefined));

		getServerGroupingFromWorkspace.restore();
		createOrShowEmbeddedPreview.restore();
	});

	it('should start task correctly', async () => {
		const serverTaskProviderTarget = sinon.stub(ServerTaskProvider.prototype, "extRunTask");
		const file = vscode.Uri.joinPath(testWorkspaces[0].uri, "/index.html");
		await manager.runTaskForFile(file);

		assert(serverTaskProviderTarget.calledOnce);
		assert(serverTaskProviderTarget.calledWith(testWorkspaces[0]));
	});

	it('should consider default file path on server open', async () => {
		settingStub.restore();
		settingStub = sandbox.stub(SettingUtil, 'GetConfig').returns(makeSetting({ defaultPreviewPath: "/page.html" }));
		await Promise.all(vscode.window.tabGroups.all.map(async (tab) => await vscode.window.tabGroups.close(tab)));

		const getServerGroupingFromWorkspace = sandbox.spy(Manager.prototype, <any>"_getServerGroupingFromWorkspace");
		const createOrShowEmbeddedPreview = sandbox.stub(ServerGrouping.prototype, "createOrShowEmbeddedPreview");
		const file = vscode.Uri.joinPath(testWorkspaces[0].uri, "/page.html");

		await manager.openPreview();

		assert(createOrShowEmbeddedPreview.calledOnce);
		assert(createOrShowEmbeddedPreview.calledWith(undefined, file));
		assert(getServerGroupingFromWorkspace.calledOnce);
		assert(getServerGroupingFromWorkspace.calledWith(testWorkspaces[0]));

		getServerGroupingFromWorkspace.restore();
		createOrShowEmbeddedPreview.restore();
	});

	it('should be able to parse string path to preview', async () => {

		const getServerGroupingFromWorkspace = sandbox.spy(Manager.prototype, <any>"_getServerGroupingFromWorkspace");
		const uri = vscode.Uri.file('c:/Users/TestUser/workspace1/page.html');
		const createOrShowEmbeddedPreview = sandbox.stub(ServerGrouping.prototype, "createOrShowEmbeddedPreview").callsFake((panel, calledUri, debug) => {
			assert(uri.path === calledUri?.path);
			return Promise.resolve();
		});
		const file = uri.fsPath;

		await manager.openPreviewAtFileString(file);

		assert(createOrShowEmbeddedPreview.calledOnce);
		assert(getServerGroupingFromWorkspace.calledOnce);
		assert(getServerGroupingFromWorkspace.calledWith(testWorkspaces[0]));

		getServerGroupingFromWorkspace.restore();
		createOrShowEmbeddedPreview.restore();
	});
});