/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/no-var-requires */

'use strict';
const fs = require('fs');

// Patch README
const readmePreamble = fs.readFileSync('./README.prerelease.md', { encoding: 'utf8' });
const readme = fs.readFileSync('./README.md', { encoding: 'utf8' });
fs.writeFileSync('./README.md', `${readmePreamble}\n${readme}`);

// Patch .vscodeignore to include sourcemaps in pre-releases
let vscodeignore = fs.readFileSync('./.vscodeignore', { encoding: 'utf8' });
vscodeignore = vscodeignore.replace(/\*\*\/\*\.map\n/, '');
fs.writeFileSync('./.vscodeignore', vscodeignore);

// The stable version should always be <major>.<minor_even_number>.patch
// For the nightly build, we keep the major, make the minor an odd number with +1, and add the timestamp as a patch.
const json = JSON.parse(fs.readFileSync('./package.json').toString());
const stableVersion = json.version.match(/(\d+)\.(\d+)\.(\d+)/);
const major = stableVersion[1];
const minor = stableVersion[2];

// Build Number $(Date:yyyyMMdd)$(Rev:.r) (ex: 20220219.1)
// For the patch number, remove the "." and if the revision is
// smaller than 10, we have to add a leading 0 (ex: 2022021901)
const buildNumber = process.argv[process.argv.length - 1];
const dateSegment = buildNumber.split('.')[0];
const revisionSegment = buildNumber.split('.')[1];
const patch = dateSegment.concat(revisionSegment.length === 1 ? `0${revisionSegment}` : revisionSegment);

const prereleasePackageJson = Object.assign(json, {
	version: `${major}.${Number(minor) + 1}.${patch}`,
});
fs.writeFileSync('./package.json', JSON.stringify(prereleasePackageJson));
