/* eslint-disable no-undef */
// This script will be run within the webview itself

// It cannot access the main VS Code APIs directly.
(function () {
	const vscode = acquireVsCodeApi();
	const connection = new WebSocket(WS_URL);
	var fadeLinkID = null;

	leftMostNavGroup = [
		document.getElementById('back'),
		document.getElementById('forward'),
		document.getElementById('reload'),
	];

	onLoad();

	function onLoad() {
		handleNavGroup(leftMostNavGroup);

		connection.onerror = (error) => {
			console.log('WebSocket error: ');
			console.log(error);
		};

		connection.onmessage = (event) => handleSocketMessage(event.data);

		document.addEventListener('DOMContentLoaded', function (e) {
			vscode.postMessage({
				command: 'refresh-back-forward-buttons',
			});
		});

		addNavButtonListeners();

		document.getElementById('url-input').addEventListener('keyup', handleKeyUp);

		window.addEventListener('message', (event) => {
			handleMessage(event.data); // The json data that the extension sent
		});

		document
			.getElementById('hostedContent')
			.contentWindow.postMessage('setup-parent-listener', '*');
	}

	function setURLBar(url) {
		document.getElementById('url-input').value = url;
	}

	function updateState(pathname) {
		vscode.setState({ currentAddress: pathname });
	}

	function handleKeyUp(event) {
		if (event.keyCode === 13) {
			event.preventDefault();
			linkTarget = document.getElementById('url-input').value;
			vscode.postMessage({
				command: 'go-to-file',
				text: linkTarget,
			});
		}
	}

	function handleNavKeyDown(event, nav, startIndex) {
		if (event.keyCode === 37) {
			// left
			moveFocusNav(false, nav, startIndex);
			event.preventDefault();
		} else if (event.keyCode === 39) {
			// right
			moveFocusNav(true, nav, startIndex);
			event.preventDefault();
		}
	}

	function handleNavGroup(nav) {
		for (var i = 0; i < nav.length; i++) {
			const currIndex = i;
			nav[i].addEventListener('keydown', (event) =>
				handleNavKeyDown(event, nav, currIndex)
			);
		}
	}

	function moveFocusNav(right, nav, startIndex) {
		var numDisabled = 0;
		var modifier = right ? 1 : -1;
		index = startIndex;
		do {
			newIndex = index + modifier;
			if (newIndex >= nav.length) {
				newIndex = 0;
			} else if (newIndex < 0) {
				newIndex = nav.length - 1;
			}
			index = newIndex;
			numDisabled++;
		} while (nav[newIndex].disabled && numDisabled < nav.length);

		if (numDisabled < nav.length) {
			nav[index].focus();
		}
	}

	function handleSocketMessage(data) {
		const parsedMessage = JSON.parse(data);
		switch (parsedMessage.command) {
			case 'foundNonInjectable':
				// if the file we went to is not injectable, make sure to add it to history manually
				vscode.postMessage({
					command: 'add-history',
					text: parsedMessage.path,
				});
				return;
		}
	}

	function adjustTabIndex() {
		var reachedElem = false;
		for (var i = 0; i < leftMostNavGroup.length; i++) {
			if (!leftMostNavGroup[i].disabled) {
				if (reachedElem) {
					leftMostNavGroup[i].tabIndex = -1;
				} else {
					leftMostNavGroup[i].tabIndex = 0;
					reachedElem = true;
				}
			}
		}
	}
	function handleMessage(message) {
		switch (message.command) {
			case 'refresh':
				document
					.getElementById('hostedContent')
					.contentWindow.postMessage('refresh', '*');
				break;
			case 'changed-history':
				msgJSON = JSON.parse(message.text);
				document.getElementById(msgJSON.element).disabled = msgJSON.disabled;
				adjustTabIndex();
				break;
			// from child iframe
			case 'update-path': {
				msgJSON = JSON.parse(message.text);
				vscode.postMessage({
					command: 'update-path',
					text: message.text,
				});
				setURLBar(msgJSON.path.href);
				updateState(msgJSON.path.pathname);

				// remove link preview box from last page.
				document.getElementById('link-preview').hidden = true;
				break;
			}
			// from child iframe
			case 'link-hover-start': {
				if (message.text.trim().length) {
					document.getElementById('link-preview').innerHTML = message.text;
					fadeLinkPreview(true);
				}
				break;
			}
			// from child iframe
			case 'link-hover-end': {
				if (!document.getElementById('link-preview').hidden) {
					fadeLinkPreview(false);
				}
				break;
			}
			case 'set-url': {
				msgJSON = JSON.parse(message.text);
				setURLBar(msgJSON.fullPath);
				updateState(msgJSON.pathname);
				break;
			}
			// from child iframe
			case 'open-external-link': {
				vscode.postMessage({
					command: 'open-browser',
					text: message.text,
				});
				break;
			}
			// from child iframe
			case 'perform-url-check': {
				sendData = {
					command: 'urlCheck',
					url: message.text,
				};
				connection.send(JSON.stringify(sendData));
				break;
			}
		}
	}

	function fadeLinkPreview(appear) {
		var elem = document.getElementById('link-preview');

		var initOpacity = appear ? 0 : 1;
		var finalOpacity = appear ? 1 : 0;

		elem.style.opacity = initOpacity;
		clearInterval(fadeLinkID);
		if (appear) {
			document.getElementById('link-preview').hidden = false;
		}

		fadeLinkID = setInterval(function () {
			if (elem.style.opacity == finalOpacity) {
				clearInterval(fadeLinkID);
				if (!appear) {
					document.getElementById('link-preview').hidden = true;
				}
			} else {
				elem.style.opacity =
					parseFloat(elem.style.opacity) + parseFloat(appear ? 0.1 : -0.1);
			}
		}, 25);
	}
	function addNavButtonListeners() {
		document.getElementById('back').onclick = function () {
			vscode.postMessage({
				command: 'go-back',
			});
		};

		document.getElementById('forward').onclick = function () {
			vscode.postMessage({
				command: 'go-forward',
			});
		};

		document.getElementById('reload').onclick = function () {
			document
				.getElementById('hostedContent')
				.contentWindow.postMessage('refresh', '*');
			document.getElementById('reload').blur();
		};

		document.getElementById('browserOpen').onclick = function () {
			vscode.postMessage({
				command: 'open-browser',
				text: '',
			});
		};
	}
})();
