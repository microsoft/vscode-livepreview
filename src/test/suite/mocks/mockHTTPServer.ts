/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import TelemetryReporter from "vscode-extension-telemetry";
// import { HttpServer } from "../../../server/httpServer";
// import * as vscode from 'vscode';
// import { Connection } from "../../../connectionInfo/connection";
// import { EndpointManager } from "../../../infoManagers/endpointManager";
// import { ContentLoader } from "../../../server/serverUtils/contentLoader";

// export class MockHTTPServer extends HttpServer {
// 	constructor(
// 		_extensionUri: vscode.Uri,
// 		private override readonly _reporter: TelemetryReporter,
// 		private override readonly _endpointManager: EndpointManager,
// 		private override readonly _connection: Connection
// 	) {
// 		super();
// 		this._contentLoader = this._register(
// 			new ContentLoader(_extensionUri, _reporter, _endpointManager, _connection)
// 		);
// 	}
// }