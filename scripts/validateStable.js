/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/no-var-requires */

'use strict';
const fs = require('fs');

const json = JSON.parse(fs.readFileSync('./package.json').toString());
const stableVersion = json.version.match(/(\d+)\.(\d+)\.(\d+)/);
const minor = stableVersion[2];

if (Number.parseInt(minor) % 2 !== 0) {
	// Pre-release documentation recommends that stable releases follow major.EVEN_NUMBER.patch
	// and pre-releases follow major.ODD_NUMBER.patch. See
	// https://code.visualstudio.com/api/working-with-extensions/publishing-extension#prerelease-extensions
	throw new Error('Stable extension version number must always be even.');
}
