/*eslint-env browser*/
// Script injected by VS Code Live Preview
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

function createConsoleOverride(type) {
	return function (msg) {
		const messagePayload = {
			type: type,
			data: JSON.stringify(msg),
		};
		postParentMessage({
			command: 'console',
			text: JSON.stringify(messagePayload),
		});
		consoleOverrides[type].apply(console, arguments);
	};
}
function handleSocketMessage(data) {
	const parsedMessage = JSON.parse(data);
	switch (parsedMessage.command) {
		case 'reload': {
			window.location.reload();
		}
	}
}

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

function onLoad() {
	const commandPayload = {
		path: window.location,
		title: document.title,
	};
	postParentMessage({
		command: 'update-path',
		text: JSON.stringify(commandPayload),
	});
	handleLinkHoverEnd();

	const links = document.getElementsByTagName('a');
	for (const i in links) {
		links[i].onclick = (e) => handleLinkClick(e.target.href);
		links[i].onmouseenter = (e) => handleLinkHoverStart(e.target.href);
		links[i].onmouseleave = (e) => handleLinkHoverEnd();
	}
}

function postParentMessage(data) {
	if (window.parent !== window) {
		window.parent.postMessage(data, '*');
	}
}
function handleLinkClick(linkTarget) {
	if (linkTarget && linkTarget != '') {
		if (!linkTarget.startsWith(host)) {
			postParentMessage({ command: 'open-external-link', text: linkTarget });
		} else {
			// check all local URLs to make sure to catch pages that won't be injectable
			postParentMessage({ command: 'perform-url-check', text: linkTarget });
		}
	}
}

function handleLinkHoverStart(linkTarget) {
	postParentMessage({
		command: 'link-hover-start',
		text: linkTarget,
	});
}

function handleLinkHoverEnd() {
	postParentMessage({
		command: 'link-hover-end',
	});
}
