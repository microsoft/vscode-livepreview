/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import sinon from 'sinon';
import vscode from 'vscode';
import fs from 'fs';
import { ContentLoader } from '../../server/serverUtils/contentLoader';
import { PathUtil } from '../../utils/pathUtil';
import { EndpointManager } from '../../infoManagers/endpointManager';
import { ConnectionManager } from '../../connectionInfo/connectionManager';
import { Connection } from '../../connectionInfo/connection';
import { MockTelemetryReporter } from './mocks/mockTelemetryReporter';
import { testWorkspaces } from './common';

async function streamToString(stream: NodeJS.ReadableStream | undefined): Promise<string> {
	if (!stream) return '';
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString('utf8');
}

describe('ContentLoader.createIndexPage', () => {
	let sandbox: sinon.SinonSandbox;
	let contentLoader: ContentLoader;
	let telemetryReporter: MockTelemetryReporter;
	let connection: Connection;

	before(async () => {
		sandbox = sinon.createSandbox();
		const extensionUri = vscode.Uri.file('c:/Users/TestUser/vscode-livepreview/');
		telemetryReporter = new MockTelemetryReporter();
		const connectionManager = new ConnectionManager();
		connection = await connectionManager.createAndAddNewConnection(testWorkspaces[0]);
		const endpointManager = new EndpointManager();

		contentLoader = new ContentLoader(extensionUri, telemetryReporter, endpointManager, connection);

		sandbox.stub(ContentLoader.prototype, <any>'fsReadDir').returns(Promise.resolve(['folder', 'anotherfolder']));
		sandbox.stub(PathUtil, 'FileExistsStat').callsFake((_path: string) => {
			// Every entry fsReadDir returns is reported as a directory, and
			// none of them has an index.html, matching the bug report's
			// workspace shape (two plain subfolders, no index files).
			return Promise.resolve({ exists: true, stat: { isDirectory: () => true } as unknown as fs.Stats });
		});
	});

	after(() => {
		contentLoader.dispose();
		telemetryReporter.dispose();
		sandbox.restore();
	});

	// Regression test for the bug reported in #855: on Windows,
	// path.join('/apps', 'folder') returns '\apps\folder' (native
	// separators), which encodeURI then turns into '%5Capps%5Cfolder'
	// instead of a working relative link. The fix uses path.posix.join for
	// the link href specifically, which always returns forward slashes
	// regardless of host OS -- see the equivalent standalone reproduction
	// in the PR description using path.win32.join vs path.posix.join
	// directly, which is what actually demonstrates the before/after
	// difference (this suite runs on whatever OS CI uses, so it can't
	// force the native-separator branch to differ here the way a real
	// Windows host does).
	it('generates directory links with forward slashes, not encoded backslashes', async () => {
		const respInfo = await contentLoader.createIndexPage('c:/Users/TestUser/workspace1/apps', '/apps');
		const html = await streamToString(respInfo.Stream as unknown as NodeJS.ReadableStream);

		assert.ok(!html.includes('%5C') && !html.includes('%5c'), `expected no encoded backslashes in:\n${html}`);
		assert.ok(html.includes('href="/apps/folder/"'), `expected a working /apps/folder/ link in:\n${html}`);
		assert.ok(html.includes('href="/apps/anotherfolder/"'), `expected a working /apps/anotherfolder/ link in:\n${html}`);
	});
});
