/* eslint-env browser */
/* global acquireVsCodeApi, WS_URL */

// This script will be run within the webview itself
(function () {
	const KEYCODE_ENTER = 13,
		KEYCODE_LEFT = 37,
		KEYCODE_UP = 38,
		KEYCODE_RIGHT = 39,
		KEYCODE_DOWN = 40,
		vscode = acquireVsCodeApi(),
		connection = new WebSocket(WS_URL),
		navGroups = {
			'leftmost-nav': true,
			'extra-menu-nav': false,
			'find-nav': true,
		};
	// 	leftMostNavGroup = [
	// 		document.getElementById('back'),
	// 		document.getElementById('forward'),
	// 		document.getElementById('reload'),
	// 	],
	// 	findNavGroup = [
	// 		document.getElementById('find-prev'),
	// 		document.getElementById('find-next'),
	// 		document.getElementById('find-x'),
	// 	];

	// console.log(stuff);

	// console.log(menuNavGroup);
	var fadeLinkID = null;
	var ctrlDown = false;

	onLoad();

	function getNavGroupElems(containerID) {
		return Array.prototype.slice.call(
			document.getElementsByClassName(containerID)
		);
	}
	/**
	 * @description run on load.
	 */
	function onLoad() {
		for (let containerID in navGroups) {
			const leftRight = navGroups[containerID];
			console.log(containerID);
			console.log(getNavGroupElems(containerID));
			handleNavGroup(getNavGroupElems(containerID), leftRight);
		}

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

		document.getElementById('url-input').addEventListener('keydown', (e) => {
			if (checkKeyCodeDetected(e, KEYCODE_ENTER)) {
				goToUrl();
			}
		});

		// set up keys for navigating find
		document.getElementById('find-input').addEventListener('keydown', (e) => {
			if (checkKeyCodeDetected(e, KEYCODE_ENTER)) {
				findNext();
			}
		});

		document.addEventListener('keydown', (e) => {
			ctrlDown = e.ctrlKey || e.metaKey;
			if ((e.key == 'F' || e.key == 'f') && ctrlDown) {
				showFind();
			}
		});

		document.addEventListener('keyup', (e) => {
			ctrlDown = e.ctrlKey || e.metaKey;
		});

		document.getElementById('more').addEventListener('keydown', (e) => {
			if (!document.getElementById('extras-menu-pane').hidden) {
				const menuNavGroup = getNavGroupElems('extra-menu-nav');
				console.log(menuNavGroup);
				console.log('owoo');
				if (checkKeyCodeDetected(e, KEYCODE_DOWN)) {
					menuNavGroup[0].focus();
				} else if (checkKeyCodeDetected(e, KEYCODE_UP)) {
					menuNavGroup[menuNavGroup.length - 1].focus();
				}
			}
		});
		window.addEventListener('message', (event) => {
			handleMessage(event.data); // The json data that the extension sent
		});

		document.getElementById('hostedContent').contentWindow.postMessage(
			{
				command: 'setup-parent-listener',
			},
			'*'
		);
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

	function goToUrl() {
		const linkTarget = document.getElementById('url-input').value;
		vscode.postMessage({
			command: 'go-to-file',
			text: linkTarget,
		});
	}

	function checkKeyCodeDetected(event, keyCode) {
		return event.keyCode == keyCode;
	}

	function handleNavGroup(nav, useRightLeft) {
		for (const i in nav) {
			const currIndex = i;
			nav[i].addEventListener('keydown', (e) => {
				if (checkKeyCodeDetected(e, useRightLeft ? KEYCODE_LEFT : KEYCODE_UP)) {
					moveFocusNav(false, nav, currIndex);
				} else if (
					checkKeyCodeDetected(e, useRightLeft ? KEYCODE_RIGHT : KEYCODE_DOWN)
				) {
					moveFocusNav(true, nav, currIndex);
				}
			});
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
			var newIndex = Number(index) + modifier;
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
		const leftMostNavGroup = getNavGroupElems('leftmost-nav');
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
				document.getElementById('hostedContent').contentWindow.postMessage(
					JSON.stringify({
						command: 'setup-parent-listener',
					}),
					'*'
				);
				break;
			case 'changed-history': {
				const msgJSON = JSON.parse(message.text);
				document.getElementById(msgJSON.element).disabled = msgJSON.disabled;
				adjustTabIndex();
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
					fadeElement(true, document.getElementById('link-preview'));
				}
				break;
			}
			// from child iframe
			case 'link-hover-end': {
				if (!document.getElementById('link-preview').hidden) {
					fadeElement(false, document.getElementById('link-preview'));
				}
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
			// from child iframe
			case 'show-find-icon': {
				document.getElementById('find-result').hidden = true;
				var codicon = document.getElementById('find-result-icon');
				const fromClass = message.text ? 'codicon-error' : 'codicon-pass';
				const toClass = message.text ? 'codicon-pass' : 'codicon-error';
				if (!codicon.classList.contains(toClass)) {
					codicon.classList.remove(fromClass);
					codicon.classList.add(toClass);
				}
				fadeElement(true, document.getElementById('find-result'));
				break;
			}
			case 'show-find': {
				showFind();
				break;
			}
		}
	}

	function showFind() {
		if (document.getElementById('find-box').hidden) {
			fadeElement(true, document.getElementById('find-box'));
		}
		document.getElementById('find-input').focus();
	}

	function hideFind() {
		if (!document.getElementById('find-box').hidden) {
			fadeElement(false, document.getElementById('find-box'));
			document.getElementById('find-result').hidden = true;
		}
	}

	// function toggleFind() {
	// 	if (document.getElementById('find-box').hidden) {
	// 		showFind();
	// 	} else {
	// 		hideFind();
	// 	}
	// }

	/**
	 * @description Fade in or out the link preview.
	 * @param {boolean} appear whether or not it should be fade from `hide -> show`; otherwise, will fade from `show -> hide`.
	 */
	function fadeElement(appear, elem) {
		var initOpacity = appear ? 0 : 1;
		var finalOpacity = appear ? 1 : 0;

		elem.style.opacity = initOpacity;
		clearInterval(fadeLinkID);
		if (appear) {
			elem.hidden = false;
		}

		fadeLinkID = setInterval(function () {
			if (elem.style.opacity == finalOpacity) {
				clearInterval(fadeLinkID);
				if (!appear) {
					elem.hidden = true;
				}
			} else {
				elem.style.opacity =
					parseFloat(elem.style.opacity) + parseFloat(appear ? 0.1 : -0.1);
			}
		}, 25);
	}

	function findNext() {
		document.getElementById('hostedContent').contentWindow.postMessage(
			{
				command: 'find-next',
				text: document.getElementById('find-input').value,
			},
			'*'
		);
	}

	function findPrev() {
		document.getElementById('hostedContent').contentWindow.postMessage(
			{
				command: 'find-prev',
				text: document.getElementById('find-input').value,
			},
			'*'
		);
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
				.contentWindow.postMessage({ command: 'refresh' }, '*');
			document.getElementById('reload').blur();
		};

		document.getElementById('browser-open').onclick = function () {
			document.getElementById('extras-menu-pane').hidden = true;
			vscode.postMessage({
				command: 'open-browser',
				text: '',
			});
		};
		document.body.onblur = function () {
			document.getElementById('extras-menu-pane').hidden = true;
		};

		document.body.onclick = function () {
			document.getElementById('extras-menu-pane').hidden = true;
		};

		document.getElementById('extras-menu-pane').onclick = function (e) {
			e.stopPropagation();
		};

		document.getElementById('more').onclick = function (e) {
			const menuPane = document.getElementById('extras-menu-pane');
			menuPane.hidden = !menuPane.hidden;
			e.stopPropagation();
		};

		document.getElementById('devtools-open').onclick = function () {
			document.getElementById('extras-menu-pane').hidden = true;
			vscode.postMessage({
				command: 'devtools-open',
				text: '',
			});
		};

		document.getElementById('find').onclick = function () {
			document.getElementById('extras-menu-pane').hidden = true;
			showFind();
		};

		document.getElementById('find-next').onclick = findNext;

		document.getElementById('find-prev').onclick = findPrev;

		document.getElementById('find-x').onclick = hideFind;
	}
})();
