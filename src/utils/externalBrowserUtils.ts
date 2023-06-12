/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CustomExternalBrowser } from "./settingsUtil";
import * as vscode from 'vscode';
import * as JSDebugBrowsers from '@vscode/js-debug-browsers';
import open from "open";

export class ExternalBrowserUtils {

	static async openInBrowser(target: string, browser: CustomExternalBrowser): Promise<void> {

		if (vscode.env.appHost !== 'desktop') {
			vscode.env.openExternal(vscode.Uri.parse(target));
			return;
		}

		if (browser === CustomExternalBrowser.default) {
			vscode.env.openExternal(vscode.Uri.parse(target));
			return;
		}
		try {
			let browserFinder: JSDebugBrowsers.IBrowserFinder | undefined;
			switch (browser) {
				case CustomExternalBrowser.chrome:
					browserFinder = new JSDebugBrowsers.ChromeBrowserFinder();
					break;
				case CustomExternalBrowser.edge:
					browserFinder = new JSDebugBrowsers.EdgeBrowserFinder();
					break;
				case CustomExternalBrowser.firefox:
					browserFinder = new JSDebugBrowsers.FirefoxBrowserFinder();
					break;
			}

			const exe = await browserFinder?.findWhere(() => true);
			if (exe) {
				await open(target, { app: { name: exe.path } });
			} else {
				vscode.window.showErrorMessage(`Could not find ${browser} installation. Please make sure it is installed or change the external preview browser in your settings.`,
					'Open Settings').then((value) => {
						if (value) {
							vscode.commands.executeCommand('workbench.action.openSettings', 'livePreview.customExternalBrowser');
						}
					});
			}
		} catch (e) {
			vscode.env.openExternal(vscode.Uri.parse(target));
		}
	}
}