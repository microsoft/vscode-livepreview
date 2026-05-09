/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-env browser */

/**
 * Script injected by the VS Code Live Preview Extension.
 * http://aka.ms/live-preview
 */

window.addEventListener('message', (event) => handleMessage(event), false);
window.addEventListener('error', (event) => handleError(event), false);

document.addEventListener('DOMContentLoaded', function (e) {
	onLoad();
});

if (window.parent !== window) {
	console.error = createConsoleOverride('ERROR');

	console.log = createConsoleOverride('LOG');

	console.warn = createConsoleOverride('WARN');

	console.info = createConsoleOverride('INFO');

	console.clear = createConsoleOverride('CLEAR');
}

/**
 * @description run initialization on load.
 */
function onLoad() {
	const connection = new WebSocket('${WS_URL}');
	connection.addEventListener('message', (e) => handleSocketMessage(e.data));

	let onlyCtrlDown = false;

	const commandPayload = {
		path: window.location,
		title: document.title,
	};

	// In embedded preview, tell the webview panel which page it is on now.
	postParentMessage({
		command: 'update-path',
		text: JSON.stringify(commandPayload),
	});

	handleLinkHoverEnd();

	const links = document.getElementsByTagName('a');
	for (const link of links) {
		// In embedded preview, all link clicks must be checked to see if the target page can be injected with this file's script.
		link.addEventListener('click', (e) => handleLinkClick(e.target.href));
		link.addEventListener('mouseenter', (e) =>
			handleLinkHoverStart(e.target.href)
		);
		link.addEventListener('mouseleave', () => handleLinkHoverEnd());
	}

	document.addEventListener('keydown', (e) => {
		onlyCtrlDown = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
		if ((e.key == 'F' || e.key == 'f') && onlyCtrlDown) {
			postParentMessage({
				command: 'show-find',
			});
			return;
		}
		postParentMessage({
			command: 'did-keydown',
			key: {
				key: e.key,
				keyCode: e.keyCode,
				code: e.code,
				shiftKey: e.shiftKey,
				altKey: e.altKey,
				ctrlKey: e.ctrlKey,
				metaKey: e.metaKey,
				repeat: e.repeat,
			},
		});
	});

	document.addEventListener('keyup', (e) => {
		onlyCtrlDown = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
		postParentMessage({
			command: 'did-keyup',
			key: {
				key: e.key,
				keyCode: e.keyCode,
				code: e.code,
				shiftKey: e.shiftKey,
				altKey: e.altKey,
				ctrlKey: e.ctrlKey,
				metaKey: e.metaKey,
				repeat: e.repeat,
			},
		});
	});
}

/**
 * Helper function to insert a `postParentMesssage` call into console function calls.
 * This will also send the printed information to the output channel if in embedded preview.
 * @param {string} type the type of console log (e.g. info, warn, error, etc.).
 */
function createConsoleOverride(type) {
	// Override console messages to allow the user to see console messages in the output channel (embedded preview only).
	const consoleOverrides = {
		ERROR: console.error,
		LOG: console.log,
		WARN: console.warn,
		INFO: console.info,
		CLEAR: console.clear,
	};
	return function (msg) {
		let stringifiedMsg = 'undefined';

		try {
			stringifiedMsg = JSON.stringify(msg);
			if (!stringifiedMsg) throw new Error('message is not in JSON format');
		} catch (err) {
			try {
				stringifiedMsg = msg.toString();
			} catch (err) {
				// noop
			}
		}

		const messagePayload = {
			type: type,
			data: stringifiedMsg,
		};
		postParentMessage({
			command: 'console',
			text: JSON.stringify(messagePayload),
		});
		consoleOverrides[type].apply(console, arguments);
	};
}

/**
 * Handle reload requests from WebSocket server.
 * @param {any} data
 */
function handleSocketMessage(data) {
	const parsedMessage = JSON.parse(data);
	switch (parsedMessage.command) {
		case 'reload': {
			reloadPage();
		}
	}
}

/**
 * Handle messages from the parent (specifically for embedded preview).
 * @param {any} event
 */
function handleMessage(event) {
	const message = event.data;

	switch (message.command) {
		case 'refresh':
			reloadPage();
			break;
		case 'refresh-forced':
			window.location.reload();
			break;
		case 'setup-parent-listener': {
			const commandPayload = {
				path: window.location,
				title: document.title,
			};

			postParentMessage({
				command: 'update-path',
				text: JSON.stringify(commandPayload),
			});
			break;
		}
		case 'find-next': {
			let findResult = window.find(message.text);
			if (!findResult) {
				if (hasFindResults(message.text)) {
					findToBeginning(message.text);
					findResult = true;
				}
			}
			postParentMessage({
				command: 'show-find-icon',
				text: findResult,
			});
			break;
		}
		case 'find-prev': {
			let findResult = window.find(message.text, false, true);
			if (!findResult) {
				if (hasFindResults(message.text)) {
					findToEnd(message.text);
					findResult = true;
				}
			}
			postParentMessage({
				command: 'show-find-icon',
				text: findResult,
			});
			break;
		}
		// ── Element Picker ────────────────────────────────────────────────────
		case 'toggle-picker':
			pickerActive ? deactivatePicker() : activatePicker();
			break;
		case 'deactivate-picker':
			deactivatePicker();
			break;
		// ─────────────────────────────────────────────────────────────────────
		default: {
			if (
				event.data.command != 'perform-url-check' &&
				event.data.command != 'update-path'
			) {
				postParentMessage(event.data);
			}
		}
	}
}

/**
 * Handle errors from the parent (specifically for embedded preview).
 * @param {any} event
 */
function handleError(event) {
	const stackMessage = event.error.stack;
	// stackMessages given in the form:
	//    "errorType: errorMessage"
	// Example:
	//    "SyntaxError: Illegal newline after throw"
	const errorType = stackMessage.split(':')[0];

	// ignore errors such as SyntaxError, ReferenceError, etc
	if (errorType === 'Error') {
		const messagePayload = {
			type: 'UNCAUGHT_ERROR',
			data: stackMessage,
		};
		postParentMessage({
			command: 'console',
			text: JSON.stringify(messagePayload),
		});
	}
}

/**
 * @param {string} searchString the string to search for.
 * @returns whether this string has find results on the page.
 */
function hasFindResults(searchString) {
	window.getSelection().removeAllRanges();
	const canGoForward = window.find(searchString);
	const canGoBack = window.find(searchString, false, true);
	return canGoForward || canGoBack;
}

/**
 * @param {string} searchString the string to search for.
 * @returns move the find position to the beginning of the page.
 */
function findToBeginning(searchString) {
	window.getSelection().removeAllRanges();
	window.find(searchString);
}

/**
 * @param {string} searchString the string to search for.
 * @returns move the find position to the end of the page.
 */
function findToEnd(searchString) {
	window.getSelection().removeAllRanges();
	window.find(searchString, false, true);
}

/**
 * Send message to the parent frame if this is an iframe (specifically for embedded preview).
 * @param {any} data
 */
function postParentMessage(data) {
	if (window.parent !== window) {
		window.parent.postMessage(data, '*');
	}
}

/**
 * @description Monitor link clicks for non-injectable files (files that cannot be injected with this script) or for external links.
 * Primarily for embedded previews.
 * @param {string} linkTarget
 */
function handleLinkClick(linkTarget) {
	const host = '${HTTP_URL}';
	if (linkTarget && linkTarget != '' && !linkTarget.startsWith('javascript:')) {
		if (!linkTarget.startsWith(host)) {
			// The embedded preview does not support external sites; let the extension know that an external link has been
			// opened in the embedded preview; this will open the modal to ask the user to navigate in an external browser
			// and will force the embedded preview back to the previous page.
			postParentMessage({ command: 'open-external-link', text: linkTarget });
		} else {
			// Check all local URLs to make sure to catch pages that won't be injectable
			postParentMessage({ command: 'perform-url-check', text: linkTarget });
		}
	}
}

/**
 * @description Show link preview on embedded preview.
 * @param {string} linkTarget
 */
function handleLinkHoverStart(linkTarget) {
	// In embedded preview, trigger the link preview.
	postParentMessage({
		command: 'link-hover-start',
		text: linkTarget,
	});
}

/**
 * @description Hide link preview on embedded preview.
 */
function handleLinkHoverEnd() {
	postParentMessage({
		command: 'link-hover-end',
	});
}

/**
 * Reloads page when requested by a socket message or parent.
 * Auto-reloading is prevented if the document body has a `data-server-no-reload` attribute.
 */
function reloadPage() {
	const block = document.body
		? document.body.hasAttribute('data-server-no-reload')
		: false;
	if (block) return;
	window.location.reload();
}

// =============================================================================
// Element Picker
// =============================================================================

let pickerActive = false;
let _highlightOverlay = null;
let _tooltipEl = null;

/**
 * @description Create the highlight overlay and tooltip DOM elements used while
 *  the picker is active. Safe to call multiple times — only creates once.
 */
function _createPickerElements() {
	if (_highlightOverlay) return;

	_highlightOverlay = document.createElement('div');
	Object.assign(_highlightOverlay.style, {
		position: 'fixed',
		pointerEvents: 'none',
		zIndex: '2147483646',
		outline: '2px solid #007acc',
		background: 'rgba(0,122,204,0.10)',
		borderRadius: '2px',
		boxSizing: 'border-box',
		transition: 'top 0.05s,left 0.05s,width 0.05s,height 0.05s',
	});

	_tooltipEl = document.createElement('div');
	Object.assign(_tooltipEl.style, {
		position: 'fixed',
		pointerEvents: 'none',
		zIndex: '2147483647',
		background: '#007acc',
		color: '#ffffff',
		fontSize: '11px',
		lineHeight: '1.4',
		padding: '2px 7px',
		borderRadius: '3px',
		fontFamily: 'monospace, monospace',
		whiteSpace: 'nowrap',
		maxWidth: '340px',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
	});

	document.body.appendChild(_highlightOverlay);
	document.body.appendChild(_tooltipEl);
}

/**
 * @description Remove and null the picker overlay elements.
 */
function _removePickerElements() {
	_highlightOverlay && _highlightOverlay.remove();
	_tooltipEl && _tooltipEl.remove();
	_highlightOverlay = null;
	_tooltipEl = null;
}

/**
 * @description Build a short, human-readable label for an element (e.g. `p.intro` or `div#header`).
 * @param {Element} el
 * @returns {string}
 */
function _getElementLabel(el) {
	const tag = el.tagName.toLowerCase();
	const id = el.id ? `#${el.id}` : '';
	const classes = el.classList.length
		? '.' + Array.from(el.classList).slice(0, 2).join('.')
		: '';
	return `${tag}${id}${classes}`;
}

/**
 * @description mousemove handler while picker is active. Updates the highlight
 *  overlay and tooltip to follow the element under the cursor.
 * @param {MouseEvent} e
 */
function _onPickerMouseMove(e) {
	if (!pickerActive) return;

	// Temporarily hide overlay so elementFromPoint is not confused by it
	if (_highlightOverlay) _highlightOverlay.style.display = 'none';
	if (_tooltipEl) _tooltipEl.style.display = 'none';

	const el = document.elementFromPoint(e.clientX, e.clientY);

	if (_highlightOverlay) _highlightOverlay.style.display = '';
	if (_tooltipEl) _tooltipEl.style.display = '';

	if (!el || el === document.documentElement || el === document.body) return;

	const rect = el.getBoundingClientRect();
	Object.assign(_highlightOverlay.style, {
		top: rect.top + 'px',
		left: rect.left + 'px',
		width: rect.width + 'px',
		height: rect.height + 'px',
	});

	const label = _getElementLabel(el);
	_tooltipEl.textContent = label;

	// Position tooltip above the element, but clamp so it stays on screen
	const tipHeight = 22;
	const tipTop = rect.top >= tipHeight + 4 ? rect.top - tipHeight - 2 : rect.bottom + 4;
	const tipLeft = Math.max(0, Math.min(rect.left, window.innerWidth - 180));
	Object.assign(_tooltipEl.style, {
		top: tipTop + 'px',
		left: tipLeft + 'px',
	});
}

/**
 * @description click handler while picker is active. Sends the selected
 *  element's info to the parent (webview panel) and deactivates the picker.
 * @param {MouseEvent} e
 */
function _onPickerClick(e) {
	if (!pickerActive) return;
	e.preventDefault();
	e.stopImmediatePropagation();

	// Hide overlays to get the real element underneath
	if (_highlightOverlay) _highlightOverlay.style.display = 'none';
	if (_tooltipEl) _tooltipEl.style.display = 'none';

	const el = document.elementFromPoint(e.clientX, e.clientY);

	if (!el || el === document.documentElement || el === document.body) {
		deactivatePicker();
		return;
	}

	const info = _buildElementInfo(el);
	postParentMessage({ command: 'element-selected', text: JSON.stringify(info) });

	deactivatePicker();
}

/**
 * @description keydown handler while picker is active. Pressing Escape cancels
 *  the picker without selecting anything.
 * @param {KeyboardEvent} e
 */
function _onPickerKeyDown(e) {
	if (!pickerActive) return;
	if (e.key === 'Escape') {
		e.stopImmediatePropagation();
		deactivatePicker();
	}
}

/**
 * @description Serialize the key information needed for the extension to locate
 *  the element in the source file.
 * @param {Element} el
 * @returns {object}
 */
function _buildElementInfo(el) {
	// Primary signal: data-lp-line injected by SourceAnnotator at serve time.
	// This is a direct, deterministic 1-based line number — no heuristics needed.
	const sourceLine = el.getAttribute('data-lp-line');

	// Fallback signals used only when data-lp-line is absent (e.g. JS-injected nodes)
	const tag = el.tagName.toLowerCase();
	const id = el.id || null;
	const className = typeof el.className === 'string' ? el.className.trim() || null : null;
	const fullText = el.textContent ? el.textContent.trim().slice(0, 120) : null;

	return {
		sourceLine: sourceLine ? parseInt(sourceLine, 10) : null,
		tagName: tag,
		id,
		className,
		fullText,
		href: window.location.pathname,
	};
}


/**
 * @description Activate the element picker: cursor becomes a crosshair, the
 *  highlight overlay tracks the hovered element, and the next click sends the
 *  element info to the extension.
 */
function activatePicker() {
	if (pickerActive) return;
	pickerActive = true;
	_createPickerElements();
	document.documentElement.style.cursor = 'crosshair';
	document.addEventListener('mousemove', _onPickerMouseMove, true);
	document.addEventListener('click', _onPickerClick, true);
	document.addEventListener('keydown', _onPickerKeyDown, true);
	postParentMessage({ command: 'picker-activated' });
}

/**
 * @description Deactivate the element picker, restore cursor and remove listeners.
 */
function deactivatePicker() {
	if (!pickerActive) return;
	pickerActive = false;
	_removePickerElements();
	document.documentElement.style.cursor = '';
	document.removeEventListener('mousemove', _onPickerMouseMove, true);
	document.removeEventListener('click', _onPickerClick, true);
	document.removeEventListener('keydown', _onPickerKeyDown, true);
	postParentMessage({ command: 'picker-deactivated' });
}