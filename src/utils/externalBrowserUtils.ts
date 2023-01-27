/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as open from 'open';
import { CustomExternalBrowser } from "./settingsUtil";
import * as vscode from 'vscode';

export class ExternalBrowserUtils {

	static async openInBrowser(target: string, browser: CustomExternalBrowser): Promise<void> {

		if (vscode.env.appHost !== 'desktop') {
			vscode.env.openExternal(vscode.Uri.parse(target));
			return;
		}

		try {
			let appName: string | readonly string[] = '';
			switch (browser) {
				case CustomExternalBrowser.chrome:
					appName = open.apps.chrome;
					break;
				case CustomExternalBrowser.edge:
					appName = open.apps.edge;
					break;
				case CustomExternalBrowser.firefox:
					appName = open.apps.firefox;
					break;
			}
			// TODO: find a way to add error message if custom browser fails to find URL https://github.com/microsoft/vscode-livepreview/issues/402
			await open(target, (appName !== '') ? { app: { name: appName } } : undefined);
		} catch (e) {
			vscode.env.openExternal(vscode.Uri.parse(target));
		}
	}
}