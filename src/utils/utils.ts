/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @description Function that formats the given date and time into a human-readable string.
 * @param date the date to be formatting.
 * @param delimeter what character to place between the date and time (defaults to comma).
 * @returns a string that expresses the shortened date and time.
 */

export function FormatDateTime(date: Date, delimeter = ', '): string {
	const mm = date.getMonth() + 1;
	const dd = date.getDate().toString().padStart(2, '0');
	const yy = date.getFullYear().toString().substring(2);

	const hh = date.getHours();
	const mi = date.getMinutes().toString().padStart(2, '0');
	const ss = date.getSeconds().toString().padStart(2, '0');

	return `${mm}/${dd}/${yy}${delimeter}${hh}:${mi}:${ss}`;
}

/**
 * @description Expresses a file's byte size in B, kB, MB, or GB.
 * @param bytes the number of bytes
 * @returns the shortened file size with its units.
 */
export function FormatFileSize(bytes: number): string {
	const sizeUnits = ['B', 'kB', 'MB', 'GB'];

	let i = 0;
	while (i < sizeUnits.length) {
		if (bytes < Math.pow(1024, i + 1)) {
			const modifiedSize = (bytes / Math.pow(1024, i)).toFixed(1);
			return `${modifiedSize} ${sizeUnits[i]}`;
		}
		i++;
	}
	const modifiedSize = (bytes / Math.pow(1024, i)).toFixed(1);
	return `${modifiedSize} TB`;
}

/**
 * @description Uses file path or filename to determine whether the file can be injected with the script (no file ending or has supported ending).
 * @param file the file to test
 * @returns whether the file is injectable.
 */
export function isFileInjectable(file: string | undefined): boolean {
	if (!file) {
		return false;
	}
	const fileEndingRegex = /\.([^/.]+)$/; // regex for seeing if there is a file ending
	const hasFileEnding = fileEndingRegex.test(file);
	return !hasFileEnding || hasInjectableFileEnding(file);
}

/**
 * @description Similar to isFileInjectable, but files without a file ending will return false.
 * @param file the file to test
 * @returns whether it is injectable.
 */
function hasInjectableFileEnding(file: string): boolean {
	const supportedEndings = ['.html', '.htm', '.xhtml'];
	return supportedEndings.find((ending) => file.endsWith(ending)) !== undefined;
}

export function escapeRegExp(str: string): string {
	// from https://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
