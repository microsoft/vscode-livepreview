/*eslint-env browser*/
/**
 * Script injected by the VS Code Live Preview Extension.
 * http://aka.ms/live-preview
 */
const ws_url = '${WS_URL}';
const host = '${HTTP_URL}';
const connection = new WebSocket(ws_url);

connection.onmessage = (event) => handleSocketMessage(event.data);

window.addEventListener('message', (event) => handleMessage(event), false);

document.addEventListener('DOMContentLoaded', function (e) {
	onLoad();
});

window.addEventListener('message', (event) => {
	if (
		event.data.command != 'perform-url-check' &&
		event.data.command != 'update-path'
	) {
		postParentMessage(event.data);
	}
});

// Override console messages to allow the user to see console messages in the output channel (embedded preview only).
const consoleOverrides = {
	ERROR: console.error,
	LOG: console.log,
	WARN: console.warn,
	INFO: console.info,
	CLEAR: console.clear,
};

console.error = createConsoleOverride('ERROR');

console.log = createConsoleOverride('LOG');

console.warn = createConsoleOverride('WARN');

console.info = createConsoleOverride('INFO');

console.clear = createConsoleOverride('CLEAR');

/**
 * @description run initialization on load.
 */
function onLoad() {
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
	for (const i in links) {
		// In embedded preview, all link clicks must be checked to see if the target page can be injected with this file's script.
		links[i].onclick = (e) => handleLinkClick(e.target.href);
		links[i].onmouseenter = (e) => handleLinkHoverStart(e.target.href);
		links[i].onmouseleave = (e) => handleLinkHoverEnd();
	}
}

/**
 * Helper function to insert a `postParentMesssage` call into console function calls.
 * This will also send the printed information to the output channel if in embedded preview.
 * @param {string} type the type of console log (e.g. info, warn, error, etc.).
 */
function createConsoleOverride(type) {
	return function (msg) {
		let stringifiedMsg = msg.toString();
		try {
			stringifiedMsg = JSON.stringify(msg);
		} catch (err) {
			// noop
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
			window.location.reload();
		}
	}
}

/**
 * Handle messages from the parent (specifically for embedded preview).
 * @param {any} event
 */
function handleMessage(event) {
	if (event.data == 'refresh') {
		window.location.reload();
	} else if (event.data == 'setup-parent-listener') {
		const commandPayload = {
			path: window.location,
			title: document.title,
		};

		postParentMessage({
			command: 'update-path',
			text: JSON.stringify(commandPayload),
		});
	}
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
	if (linkTarget && linkTarget != '') {
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
