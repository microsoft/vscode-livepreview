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
