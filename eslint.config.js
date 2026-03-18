/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const headerPlugin = require('eslint-plugin-header');

// eslint-plugin-header@3.1.1 does not declare a rule schema, so ESLint 9
// rejects any options by default. Patch the meta to allow its options.
headerPlugin.rules.header.meta.schema = [
	{ type: 'string' },
	{ oneOf: [{ type: 'string' }, { type: 'array', items: {} }] },
	{ oneOf: [{ type: 'number' }, { type: 'object' }] },
];

module.exports = [
	js.configs.recommended,
	...tsPlugin.configs['flat/recommended'],
	{
		plugins: {
			header: headerPlugin,
		},
		rules: {
			semi: [2, 'always'],
			'@typescript-eslint/no-unused-vars': 0,
			'@typescript-eslint/no-explicit-any': 0,
			'@typescript-eslint/explicit-module-boundary-types': 0,
			'@typescript-eslint/no-non-null-assertion': 0,
			'@typescript-eslint/explicit-function-return-type': 1,
			'header/header': [
				2,
				'block',
				[
					'---------------------------------------------------------------------------------------------',
					' *  Copyright (c) Microsoft Corporation. All rights reserved.',
					' *  Licensed under the MIT License. See License.txt in the project root for license information.',
					' *--------------------------------------------------------------------------------------------',
				],
			],
		},
	},
];
