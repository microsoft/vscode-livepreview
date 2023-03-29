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

const testWorkspaces: vscode.WorkspaceFolder[] = [{
	uri: vscode.Uri.file('C:/Users/TestUser/workspace1'),
	name: '',
	index: 0,
},
{
	uri: vscode.Uri.file('C:/Users/TestUser/workspace2'),
	name: '',
	index: 1,
}
];

describe('ConnectionInfo', () => {
	let sandbox: sinon.SinonSandbox;
	let connectionManager: ConnectionManager;
	before(() => {
		sandbox = sinon.createSandbox();

		connectionManager = new ConnectionManager();

		const existingPaths = [
			'c:/Users/TestUser/workspace1/index.html', 'c:/Users/TestUser/workspace1/pages/page1.html',
			'/home/TestUser/workspace1/index.html', '/home/TestUser/workspace1/pages/page1.html',
			'//other/TestUser/workspace1/index.html', '//other/TestUser/workspace1/pages/page1.html',
			'c:/Users/TestUser/personal.html'
		];

		sandbox.stub(PathUtil, 'FileExistsStat').callsFake((path: string) => {
			if (existingPaths.indexOf(PathUtil.ConvertToPosixPath(path)) > -1) {
				return Promise.resolve({ exists: true, stat: new Stats() });
			}
			return Promise.resolve({ exists: false, stat: new Stats() });
		});
	});

	after(() => {
		sandbox.restore();
	});

	describe('ConnectionInfo', () => {
		it('should be able to create a Connection', () => {
			const connection = connectionManager.createAndAddNewConnection(testWorkspaces[0]);
		});
	});
});