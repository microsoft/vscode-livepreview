/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CustomExternalBrowser } from "./settingsUtil";
import * as vscode from 'vscode';

export class ExternalBrowserUtils {

	static async openInBrowser(target: string, browser: CustomExternalBrowser): Promise<void> {
		if (vscode.env.appHost !== 'desktop' || browser === CustomExternalBrowser.default) {
			vscode.env.openExternal(vscode.Uri.parse(target));
			return;
		}

		try {
			const browserStr = browser.toLowerCase(); // the debug companion expects lowercase browser names
			vscode.commands.executeCommand('js-debug-companion.launch', {browserType: browserStr, URL: target});
		} catch (e) {

			vscode.env.openExternal(vscode.Uri.parse(target));
		}
	}
}