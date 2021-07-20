/* eslint-env browser */
/* global acquireVsCodeApi, WS_URL */
// This script will be run within the webview itself
(function () {
	const vscode = acquireVsCodeApi();
	const connection = new WebSocket(WS_URL);
	var fadeLinkID = null;

	const leftMostNavGroup = [
		document.getElementById('back'),
		document.getElementById('forward'),
		document.getElementById('reload'),
	];

	onLoad();

	/**
	 * @description run on load.
	 */
	function onLoad() {
		// handle the arrow-key navigation between the leftmost nav group.
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

		// add listeners to all nav buttons.
		addNavButtonListeners();

		document.getElementById('url-input').addEventListener('keyup', handleKeyUp);

		window.addEventListener('message', (event) => {
			handleMessage(event.data); // The json data that the extension sent
		});

		document
			.getElementById('hostedContent')
			.contentWindow.postMessage('setup-parent-listener', '*');
	}

	/**
	 * @param {string} url the URL to use to set the URL bar.
	 */
	function setURLBar(url) {
		document.getElementById('url-input').value = url;
	}

	/**
	 * @description Update the webview's state with the current pathname to allow correct serialize/deserialize.
	 * @param {string} pathname
	 */
	function updateState(pathname) {
		vscode.setState({ currentAddress: pathname });
	}

	/**
	 * @description handling key up on URL bar.
	 * @param {keyup} event the keyup info.
	 */
	function handleKeyUp(event) {
		if (event.keyCode === 13) {
			event.preventDefault();
			const linkTarget = document.getElementById('url-input').value;
			vscode.postMessage({
				command: 'go-to-file',
				text: linkTarget,
			});
		}
	}

	/**
	 * @description handle key down in leftmost nav button area.
	 * @param {keydown} event the keydown info.
	 * @param {HTMLElement[]} nav the navigation elements.
	 * @param {number} startIndex the index of the current HTMLElement focused (in `nav` array).
	 */
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
		for (const i in nav) {
			const currIndex = i;
			nav[i].addEventListener('keydown', (event) =>
				handleNavKeyDown(event, nav, currIndex)
			);
		}
	}

	/**
	 * Move the focus appropriately based on left/right action.
	 * @param {boolean} right whether to shift the focus right (!right will assume moving left).
	 * @param {HTMLElement[]} nav the navigation elements.
	 * @param {number} startIndex the index of the current HTMLElement focused (in `nav` array).
	 */
	function moveFocusNav(right, nav, startIndex) {
		// logic behind shifting focus based on arrow-keys
		var numDisabled = 0;
		var modifier = right ? 1 : -1;
		var index = startIndex;
		do {
			var newIndex = index + modifier;
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

	/**
	 * @description adjust the tab indices of the navigation buttons based on which buttons are disabled.
	 */
	function adjustTabIndex() {
		var reachedElem = false;
		for (const i in leftMostNavGroup) {
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

	/**
	 * @description handle messages coming from WebSocket. Usually are messages notifying of non-injectable files
	 *  that the extension should be aware of.
	 * @param {any} data
	 */
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

	/**
	 * @description handle messages coming from the child frame and extension.
	 * @param {any} message
	 */
	function handleMessage(message) {
		switch (message.command) {
			case 'refresh':
				document
					.getElementById('hostedContent')
					.contentWindow.postMessage('refresh', '*');
				break;
			case 'changed-history': {
				const msgJSON = JSON.parse(message.text);
				document.getElementById(msgJSON.element).disabled = msgJSON.disabled;
				adjustTabIndex();
				break;
			}
			// from child iframe
			case 'update-path': {
				const msgJSON = JSON.parse(message.text);
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
				const msgJSON = JSON.parse(message.text);
				// setting a new address, ensure that previous link preview is gone
				document.getElementById('link-preview').hidden = true;
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
			case 'console': {
				vscode.postMessage({
					command: 'console',
					text: message.text,
				});
				break;
			}
			// from child iframe
			case 'perform-url-check': {
				const sendData = {
					command: 'urlCheck',
					url: message.text,
				};
				connection.send(JSON.stringify(sendData));
				break;
			}
		}
	}

	/**
	 * @description Fade in or out the link preview.
	 * @param {boolean} appear whether or not it should be fade from `hide -> show`; otherwise, will fade from `show -> hide`.
	 */
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

	/**
	 * @description Add funcionality to the nav buttons.
	 */
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
