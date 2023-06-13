/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import sinon from 'sinon';

import { EndpointManager } from '../../infoManagers/endpointManager';
import { PathUtil } from '../../utils/pathUtil';
import { Stats } from 'fs';

describe('EndpointManager', () => {
	let sandbox: sinon.SinonSandbox;
	let endpointManager: EndpointManager;
	before(() => {
		sandbox = sinon.createSandbox();

		endpointManager = new EndpointManager();
		const existingPaths = ['c:/Users/TestUser/workspace1/index.html', 'c:/Users/TestUser/workspace1/pages/page1.html',
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
		endpointManager.dispose();
		sandbox.restore();
	});

	// storing paths
	it('returns the identical path for windows when encoding the path', async () => {
		const endpoint = await endpointManager.encodeLooseFileEndpoint('c:/Users/TestUser/workspace1/index.html');
		assert.strictEqual(endpoint, 'c:/Users/TestUser/workspace1/index.html');
	});

	it('returns the identical path for unix without the leading forward slash when encoding the path', async () => {
		const endpoint = await endpointManager.encodeLooseFileEndpoint('/home/TestUser/workspace1/index.html');
		assert.strictEqual(endpoint, 'home/TestUser/workspace1/index.html');
	});

	it('returns an unsaved path for files that do not exist yet when encoding the path', async () => {
		const endpoint = await endpointManager.encodeLooseFileEndpoint('c:/Users/TestUser/workspace1/dex.html');
		assert.strictEqual(endpoint, 'endpoint_unsaved/dex.html');
	});

	it('returns a slightly modified path for UNC when encoding the path', async () => {
		const endpoint = await endpointManager.encodeLooseFileEndpoint('//other/TestUser/workspace1/index.html');
		assert.strictEqual(endpoint, 'unc/other/TestUser/workspace1/index.html');
	});

	// fetching paths: anything that is a child of the encoded path's parents should be encoded (if it exists)
	// otherwise, return undefined
	it('decodes the windows endpoint correctly', async () => {
		const file1 = await endpointManager.decodeLooseFileEndpoint('/c:/Users/TestUser/workspace1/index.html');
		assert.strictEqual(file1, 'c:/Users/TestUser/workspace1/index.html');

		const file2 = await endpointManager.decodeLooseFileEndpoint('/c:/Users/TestUser/workspace1/pages/page1.html');
		assert.strictEqual(file2, 'c:/Users/TestUser/workspace1/pages/page1.html');
	});

	it('decodes the unix endpoint correctly', async () => {
		const file1 = await endpointManager.decodeLooseFileEndpoint('/home/TestUser/workspace1/index.html');
		assert.strictEqual(file1, '/home/TestUser/workspace1/index.html');

		const file2 = await endpointManager.decodeLooseFileEndpoint('/home/TestUser/workspace1/pages/page1.html');
		assert.strictEqual(file2, '/home/TestUser/workspace1/pages/page1.html');
	});

	it('decodes the UNC endpoint correctly', async () => {
		const file1 = await endpointManager.decodeLooseFileEndpoint('/unc/other/TestUser/workspace1/index.html');
		assert.strictEqual(file1, '//other/TestUser/workspace1/index.html');

		const file2 = await endpointManager.decodeLooseFileEndpoint('/unc/other/TestUser/workspace1/pages/page1.html');
		assert.strictEqual(file2, '//other/TestUser/workspace1/pages/page1.html');
	});

	it('refuses to decode invalid paths', async () => {
		const file1 = await endpointManager.decodeLooseFileEndpoint('/c:/Users/TestUser/personal.html'); // in parent directory
		const file2 = await endpointManager.decodeLooseFileEndpoint('/page1.html'); // invalid (must be absolute path)
		const file3 = await endpointManager.decodeLooseFileEndpoint('/c:/Users/TestUser/workspace1/fake.html'); // does not exist

		assert.strictEqual(file1, undefined);
		assert.strictEqual(file2, undefined);
		assert.strictEqual(file3, undefined);
	});
});