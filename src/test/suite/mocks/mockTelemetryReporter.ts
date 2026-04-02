/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TelemetryReporter, TelemetryEventMeasurements, TelemetryEventProperties } from '@vscode/extension-telemetry';
import * as vscode from 'vscode';

export class MockTelemetryReporter implements TelemetryReporter {
	telemetryLevel: 'all' | 'error' | 'crash' | 'off' = 'off';
	onDidChangeTelemetryLevel: vscode.Event<'all' | 'error' | 'crash' | 'off'> = new vscode.EventEmitter<'all' | 'error' | 'crash' | 'off'>().event;
	setContextTag(_key: string, _value: string): void {
		// noop
	}
	getContextTag(_key: string): string | undefined {
		return undefined;
	}
	sendTelemetryEvent(_eventName: string, _properties?: TelemetryEventProperties | undefined, _measurements?: TelemetryEventMeasurements | undefined): void {
		// noop
	}
	sendRawTelemetryEvent(_eventName: string, _properties?: TelemetryEventProperties | undefined, _measurements?: TelemetryEventMeasurements | undefined): void {
		// noop
	}
	sendDangerousTelemetryEvent(_eventName: string, _properties?: TelemetryEventProperties | undefined, _measurements?: TelemetryEventMeasurements | undefined): void {
		// noop
	}
	sendTelemetryErrorEvent(_eventName: string, _properties?: TelemetryEventProperties | undefined, _measurements?: TelemetryEventMeasurements | undefined): void {
		// noop
	}
	sendDangerousTelemetryErrorEvent(_eventName: string, _properties?: TelemetryEventProperties | undefined, _measurements?: TelemetryEventMeasurements | undefined): void {
		// noop
	}
	sendDangerousTelemetryException(_exception: Error, _properties?: TelemetryEventProperties | undefined, _measurements?: TelemetryEventMeasurements | undefined): void {
		// noop
	}
	dispose(): Promise<any> {
		return Promise.resolve();
	}
}
