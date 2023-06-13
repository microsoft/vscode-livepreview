/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import sinon from 'sinon';
import vscode from 'vscode';
import { PathUtil } from '../../utils/pathUtil';
import { SettingUtil } from '../../utils/settingsUtil';
import { Stats } from 'fs';
import { makeSetting, testWorkspaces } from './common';


describe('GetValidServerRootForWorkspace', () => {

	let sandbox: sinon.SinonSandbox;

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		const fakeSetting = makeSetting({ serverRoot: 'test' });
		sandbox.stub(SettingUtil, 'GetConfig').returns(fakeSetting);
	});

	afterEach(() => {
		sandbox.restore();
	});

	it('returns serverRoot if exists', async () => {
		sandbox.stub(PathUtil, 'FileExistsStat').returns(Promise.resolve({ exists: true, stat: new Stats() }));

		const actual = await PathUtil.GetValidServerRootForWorkspace(testWorkspaces[0]);
		assert.strictEqual(actual, 'test');
	});


	it('returns no root if serverRoot does not exists', async () => {
		sandbox.stub(PathUtil, 'FileExistsStat').returns(Promise.resolve({ exists: false, stat: new Stats() }));

		const actual = await PathUtil.GetValidServerRootForWorkspace(testWorkspaces[0]);
		assert.strictEqual(actual, '');
	});
});


describe('GetWorkspaceFromRelativePath / GetWorkspaceFromAbsolutePath', () => {

	let sandbox: sinon.SinonSandbox;

	beforeEach(() => {
		sandbox = sinon.createSandbox();

		const existingPaths = ['c:/Users/TestUser/workspace2', 'c:/Users/TestUser/workspace2/test',
			'c:/Users/TestUser/workspace2/1/2/3/4.html', 'c:/Users/TestUser/workspace2/test/1/2/3/4.html'];
		sandbox.stub(PathUtil, 'FileExistsStat').callsFake((path: string) => {
			if (existingPaths.indexOf(PathUtil.ConvertToPosixPath(path)) > -1) {
				return Promise.resolve({ exists: true, stat: new Stats() });
			}
			return Promise.resolve({ exists: false, stat: new Stats() });
		});
	});

	afterEach(() => {
		sandbox.restore();
	});

	it('returns the correct workspace when there is one matching workspace', async () => {

		sandbox.stub(vscode.workspace, 'workspaceFolders').value([testWorkspaces[1]]);
		sandbox.stub(SettingUtil, 'GetConfig').returns(makeSetting({}));

		const actualRel = await PathUtil.GetWorkspaceFromRelativePath('/1/2/3/4.html');
		const actualAbs = await PathUtil.GetWorkspaceFromAbsolutePath('c:/Users/TestUser/workspace2/1/2/3/4.html');
		assert.strictEqual(actualRel, testWorkspaces[1]);
		assert.strictEqual(actualAbs, testWorkspaces[1]);
	});


	it('returns the correct workspace when there are multiple workspaces', async () => {
		sandbox.stub(vscode.workspace, 'workspaceFolders').value(testWorkspaces);
		sandbox.stub(SettingUtil, 'GetConfig').returns(makeSetting({}));

		const actualRel = await PathUtil.GetWorkspaceFromRelativePath('/1/2/3/4.html');
		const actualAbs = await PathUtil.GetWorkspaceFromAbsolutePath('c:/Users/TestUser/workspace2/1/2/3/4.html');
		assert.strictEqual(actualRel, testWorkspaces[1]);
		assert.strictEqual(actualAbs, testWorkspaces[1]);
	});


	it('returns the correct workspace when the file is in a workspace with a set serverRoot', async () => {
		sandbox.stub(vscode.workspace, 'workspaceFolders').value(testWorkspaces);
		sandbox.stub(SettingUtil, 'GetConfig').returns(makeSetting({ serverRoot: 'test' }));

		const actualRel = await PathUtil.GetWorkspaceFromRelativePath('/1/2/3/4.html');
		const actualAbs = await PathUtil.GetWorkspaceFromAbsolutePath('c:/Users/TestUser/workspace2/test/1/2/3/4.html');
		assert.strictEqual(actualRel, testWorkspaces[1]);
		assert.strictEqual(actualAbs, testWorkspaces[1]);
	});

	it('returns undefined when there is no workspace', async () => {
		sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);

		const actualRel = await PathUtil.GetWorkspaceFromRelativePath('/1/2/3/4.html');
		const actualAbs = await PathUtil.GetWorkspaceFromAbsolutePath('c:/Users/TestUser/workspace2/test/1/2/3/4.html');
		assert.strictEqual(actualRel, undefined);
		assert.strictEqual(actualAbs, undefined);
	});

	it('returns undefined when workspace exists, but absolute path is not within serverRoot', async () => {
		sandbox.stub(vscode.workspace, 'workspaceFolders').value(testWorkspaces);
		sandbox.stub(SettingUtil, 'GetConfig').returns(makeSetting({ serverRoot: 'test' }));

		const actual = await PathUtil.GetWorkspaceFromAbsolutePath('c:/Users/TestUser/workspace2/1/2/3/4.html');
		assert.strictEqual(actual, undefined);
	});

	it('returns undefined when workspace exists, but relative path does not exist', async () => {
		sandbox.stub(vscode.workspace, 'workspaceFolders').value(testWorkspaces);
		sandbox.stub(SettingUtil, 'GetConfig').returns(makeSetting({ serverRoot: 'test' }));

		const actual = await PathUtil.GetWorkspaceFromRelativePath('/2/2/3/4.html');
		assert.strictEqual(actual, undefined);
	});
});

describe('getEndpointParent', () => {
	it('returns the correct endpoint parent for full paths', async () => {
		const endpoint1 = PathUtil.GetEndpointParent('c:/Users/TestUser/workspace1/');
		const endpoint2 = PathUtil.GetEndpointParent('c:/Users/TestUser/workspace1');
		const endpoint3 = PathUtil.GetEndpointParent('/');
		assert.strictEqual(endpoint1, 'workspace1');
		assert.strictEqual(endpoint2, 'workspace1');
		assert.strictEqual(endpoint3, '.');
	});
});