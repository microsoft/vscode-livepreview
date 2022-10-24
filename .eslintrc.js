/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**@type {import('eslint').Linter.Config} */
// eslint-disable-next-line no-undef
module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint', 'header'],
	extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
	rules: {
		semi: [2, 'always'],
		'@typescript-eslint/no-unused-vars': 0,
		'@typescript-eslint/no-explicit-any': 0,
		'@typescript-eslint/explicit-module-boundary-types': 0,
		'@typescript-eslint/no-non-null-assertion': 0,
		'@typescript-eslint/explicit-function-return-type':1,
		"header/header": [
			2,
			"block",
			[
				"---------------------------------------------------------------------------------------------",
				" *  Copyright (c) Microsoft Corporation. All rights reserved.",
				" *  Licensed under the MIT License. See License.txt in the project root for license information.",
				" *--------------------------------------------------------------------------------------------"
			]
		]
	},
};
