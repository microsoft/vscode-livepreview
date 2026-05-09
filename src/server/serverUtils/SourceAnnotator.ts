/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @description Annotates every HTML opening tag with a `data-lp-line` attribute
 * containing its 1-based line number in the source file.
 *
 * This gives the browser-side picker a deterministic, zero-ambiguity way to identify
 * which source line corresponds to the clicked element — no heuristics, no scoring.
 *
 * Algorithm:
 *   - Split the HTML into lines (preserving the original line structure).
 *   - For each line, find every opening tag (not self-closing, not closing, not comments).
 *   - Insert `data-lp-line="N"` into the tag before its closing `>`.
 *   - Rejoin the lines and return the annotated HTML.
 *
 * Tags that are NOT annotated:
 *   - Closing tags (</div>)
 *   - Self-closing tags (<br/>, <img/>)
 *   - Comments (<!-- ... -->)
 *   - Script and style content (to avoid corrupting JS/CSS)
 *   - The injected script tag itself
 */
export class SourceAnnotator {
	/**
	 * Void elements that must not receive a closing tag or data attributes
	 * in some parsers, but we still annotate them since browsers handle
	 * `data-*` on void elements correctly.
	 */
	private static readonly _VOID_ELEMENTS = new Set([
		'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
		'link', 'meta', 'param', 'source', 'track', 'wbr',
	]);

	/**
	 * @description Inject `data-lp-line="N"` into every opening HTML tag.
	 * @param {string} html The raw HTML string to annotate.
	 * @returns {string} The annotated HTML string.
	 */
	public static annotate(html: string): string {
		const lines = html.split('\n');
		const result: string[] = [];

		// Track whether we are inside a <script> or <style> block to avoid
		// modifying their contents (which would corrupt JS/CSS syntax).
		let inScript = false;
		let inStyle = false;

		// Multi-line tag tracking: a tag that opens on one line may close on another.
		// We accumulate the tag across lines until we find the closing >.
		let pendingTag = '';
		let pendingTagStartLine = -1;
		let pendingLinesBefore: string[] = [];

		for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
			const line = lines[lineIdx];
			const lineNumber = lineIdx + 1; // 1-based for VS Code

			// If we are still accumulating a multi-line tag, append this line
			if (pendingTag !== '') {
				pendingTag += '\n' + line;
				const closeIdx = SourceAnnotator._findTagClose(pendingTag);
				if (closeIdx !== -1) {
					// Tag is now complete — inject the attribute at close position
					const annotated = SourceAnnotator._injectAttr(
						pendingTag, closeIdx, pendingTagStartLine
					);
					// The first line of the pending tag is already in pendingLinesBefore
					// Split the annotated result back into lines
					const annotatedLines = annotated.split('\n');
					for (const al of annotatedLines) {
						result.push(al);
					}
					pendingTag = '';
					pendingTagStartLine = -1;
					pendingLinesBefore = [];
				}
				// If still not closed, keep accumulating (handled by next iteration)
				continue;
			}

			// Skip script/style content — do not modify anything inside
			if (inScript) {
				result.push(line);
				if (/<\/script\s*>/i.test(line)) { inScript = false; }
				continue;
			}
			if (inStyle) {
				result.push(line);
				if (/<\/style\s*>/i.test(line)) { inStyle = false; }
				continue;
			}

			// Process this line: find and annotate all opening tags on it
			const annotatedLine = SourceAnnotator._annotateLine(line, lineNumber);
			result.push(annotatedLine);

			// Check if we entered a script or style block on this line
			if (/<script[\s>]/i.test(line) && !/<\/script\s*>/i.test(line)) {
				inScript = true;
			}
			if (/<style[\s>]/i.test(line) && !/<\/style\s*>/i.test(line)) {
				inStyle = true;
			}
		}

		return result.join('\n');
	}

	/**
	 * @description Find all opening tags in a single line and inject `data-lp-line`.
	 */
	private static _annotateLine(line: string, lineNumber: number): string {
		// Skip lines that are purely comments or CDATA
		const trimmed = line.trim();
		if (trimmed.startsWith('<!--') || trimmed.startsWith('<![')) {
			return line;
		}

		let result = '';
		let pos = 0;

		while (pos < line.length) {
			const tagStart = line.indexOf('<', pos);
			if (tagStart === -1) {
				// No more tags on this line
				result += line.substring(pos);
				break;
			}

			// Append everything before this tag
			result += line.substring(pos, tagStart);

			// Check what kind of tag this is
			const rest = line.substring(tagStart);

			// Comment: skip to end of comment
			if (rest.startsWith('<!--')) {
				const commentEnd = rest.indexOf('-->');
				if (commentEnd !== -1) {
					result += rest.substring(0, commentEnd + 3);
					pos = tagStart + commentEnd + 3;
				} else {
					// Comment continues on next lines — just emit as-is
					result += rest;
					pos = line.length;
				}
				continue;
			}

			// Closing tag: emit as-is
			if (rest.startsWith('</')) {
				const closeEnd = rest.indexOf('>');
				if (closeEnd !== -1) {
					result += rest.substring(0, closeEnd + 1);
					pos = tagStart + closeEnd + 1;
				} else {
					result += rest;
					pos = line.length;
				}
				continue;
			}

			// DOCTYPE / processing instruction: emit as-is
			if (rest.startsWith('<!') || rest.startsWith('<?')) {
				const end = rest.indexOf('>');
				if (end !== -1) {
					result += rest.substring(0, end + 1);
					pos = tagStart + end + 1;
				} else {
					result += rest;
					pos = line.length;
				}
				continue;
			}

			// Opening tag: find the closing >
			const closeIdx = SourceAnnotator._findTagClose(rest);
			if (closeIdx === -1) {
				// Tag doesn't close on this line — emit as-is (multi-line tags
				// are handled at the outer level, but _annotateLine is called only
				// for complete single lines so this is a safety fallback)
				result += rest;
				pos = line.length;
				continue;
			}

			const fullTag = rest.substring(0, closeIdx + 1);

			// Skip if already annotated (e.g. injected script tag)
			if (fullTag.includes('data-lp-line=')) {
				result += fullTag;
				pos = tagStart + closeIdx + 1;
				continue;
			}

			// Skip if this is the Live Preview injected script
			if (fullTag.includes('___vscode_livepreview')) {
				result += fullTag;
				pos = tagStart + closeIdx + 1;
				continue;
			}

			// Inject the attribute
			result += SourceAnnotator._injectAttr(fullTag, closeIdx, lineNumber);
			pos = tagStart + closeIdx + 1;
		}

		return result;
	}

	/**
	 * @description Find the index of the closing `>` of a tag, correctly handling
	 * quoted attribute values that may contain `>` characters.
	 * @returns {number} Index of the `>`, or -1 if not found.
	 */
	private static _findTagClose(tagStr: string): number {
		let inSingle = false;
		let inDouble = false;

		for (let i = 1; i < tagStr.length; i++) {
			const ch = tagStr[i];
			if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
			if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
			if (!inSingle && !inDouble && ch === '>') { return i; }
		}
		return -1;
	}

	/**
	 * @description Insert `data-lp-line="N"` before the closing `>` of a tag.
	 * Handles self-closing tags (`/>`), preserving the slash.
	 */
	private static _injectAttr(tag: string, closeIdx: number, lineNumber: number): string {
		const attr = ` data-lp-line="${lineNumber}"`;

		// Self-closing: insert before the />
		if (tag[closeIdx - 1] === '/') {
			return (
				tag.substring(0, closeIdx - 1) +
				attr +
				tag.substring(closeIdx - 1)
			);
		}

		// Normal closing >
		return (
			tag.substring(0, closeIdx) +
			attr +
			tag.substring(closeIdx)
		);
	}
}