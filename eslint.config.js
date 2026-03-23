/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const headers = require('eslint-plugin-headers');

module.exports = tseslint.config(
	js.configs.recommended,
	tseslint.configs.recommended,
	{
		plugins: {
			headers,
		},
		rules: {
			semi: [2, 'always'],
			'@typescript-eslint/no-unused-vars': 0,
			'@typescript-eslint/no-explicit-any': 0,
			'@typescript-eslint/explicit-module-boundary-types': 0,
			'@typescript-eslint/no-non-null-assertion': 0,
			'@typescript-eslint/explicit-function-return-type': 1,
			'headers/header-format': [
				2,
				{
					source: 'string',
					style: 'jsdoc',
					content: 'Copyright (c) Microsoft Corporation. All rights reserved.\nLicensed under the MIT License. See License.txt in the project root for license information.',
					blockPrefix: '---------------------------------------------------------------------------------------------\n',
					linePrefix: ' *  ',
					blockSuffix: '\n *--------------------------------------------------------------------------------------------',
				},
			],
		},
	},
);
