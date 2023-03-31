/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import TelemetryReporter, { RawTelemetryEventProperties, TelemetryEventMeasurements, TelemetryEventProperties } from 'vscode-extension-telemetry';

export class MockTelemetryReporter implements TelemetryReporter {
	sendTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		// noop
	}
	sendTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined, errorProps?: string[] | undefined): void {
		// noop
	}
	dispose(): Promise<any> {
		return Promise.resolve();
	}
	sendRawTelemetryEvent(eventName: string, properties?: RawTelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		// noop
	}
	sendTelemetryException(error: Error, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		// noop
	}
}
