/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const headerPlugin = require('eslint-plugin-header');

// eslint-plugin-header does not define meta.schema for its rules, which ESLint 9 requires.
// Setting schema: false disables option validation for this rule.
// TODO: remove this workaround once eslint-plugin-header adds ESLint 9 flat config support.
headerPlugin.rules['header'].meta.schema = false;

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
