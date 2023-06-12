/* eslint-disable no-undef */
//@ts-check

'use strict';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CopyPlugin = require('copy-webpack-plugin');

/**@type {import('webpack').Configuration}*/
const config = {
	context: path.resolve(__dirname),
	target: 'node', // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/

	entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
	output: {
		// the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
		path: path.resolve(__dirname, 'out'),
		filename: 'extension.js',
		libraryTarget: 'commonjs2',
		devtoolModuleFilenameTemplate: '../[resource-path]',
	},
	devtool: 'source-map',
	externals: {
		'applicationinsights-native-metrics':
			'commonjs applicationinsights-native-metrics', // https://github.com/microsoft/vscode-extension-telemetry/issues/41#issuecomment-598852991
		vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
		'utf-8-validate': 'commonjs utf-8-validate',
		bufferutil: 'commonjs bufferutil',
	},
	resolve: {
		// support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
		extensions: ['.ts', '.js'],
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: 'ts-loader',
			},
		],
	},

	plugins: [
		new CopyPlugin({
			patterns: [
				{
					from: './node_modules/@vscode/codicons/dist/codicon.css',
					to: '../media/codicon.css',
				},
				{
					from: './node_modules/@vscode/codicons/dist/codicon.ttf',
					to: '../media/codicon.ttf',
				},
			],
		}),
		new CleanWebpackPlugin({
			cleanOnceBeforeBuildPatterns: ['*/'],
		}),
	],
};
module.exports = config;
