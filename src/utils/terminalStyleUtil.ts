/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @description the color to make the terminal text.
 */
export enum TerminalColor {
	red = 31,
	green = 32,
	yellow = 33,
	blue = 34,
	purple = 35,
	cyan = 36,
}

/**
 * @description Styling applied to the terminal string - reset (nothing), bold, or underline.
 */
export enum TerminalDeco {
	reset = 0,
	bold = 1,
	underline = 4,
}

/**
 * @description A collection of functions for styling terminal strings.
 */
export class TerminalStyleUtil {
	/**
	 * @description Create a string that will be colored and decorated when printed in the terminal/pty.
	 * @param {string} input the input string to stylize.
	 * @param {TerminalColor} color the TerminalColor to use.
	 * @param {TerminalDeco} decoration optional; the TerminalDeco styling to use.
	 * @returns {string} the styled string.
	 */
	public static ColorTerminalString(
		input: string,
		color: TerminalColor,
		decoration = TerminalDeco.reset
	): string {
		return `\x1b[${decoration};${color}m${input}\x1b[0m`;
	}
}
