/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-env browser */
/* global acquireVsCodeApi, WS_URL */

// This script will be run within the webview itself
(function () {
	const KEY_ENTER = 'Enter',
		KEY_LEFT = 'ArrowLeft',
		KEY_UP = 'ArrowUp',
		KEY_RIGHT = 'ArrowRight',
		KEY_DOWN = 'ArrowDown',
		vscode = acquireVsCodeApi(),
		connection = new WebSocket(WS_URL),
		navGroups = {
			'leftmost-nav': true,
			'extra-menu-nav': false,
			'find-nav': true,
		};
	let fadeLinkID = null,
		onlyCtrlDown = false;

	onLoad();

	/**
	 * @description run on load.
	 */
	function onLoad() {
		for (const groupClassName in navGroups) {
			const leftRight = navGroups[groupClassName];
			handleNavGroup(getNavGroupElems(groupClassName), leftRight);
		}

		connection.addEventListener('error', (e) => {
			console.log('WebSocket error: ');
			console.log(e);
		});
		connection.addEventListener('message', (e) => handleSocketMessage(e.data));

		document.addEventListener('DOMContentLoaded', function (e) {
			vscode.postMessage({
				command: 'refresh-back-forward-buttons',
			});
		});

		addNavButtonListeners();

		document.getElementById('url-input').addEventListener('keydown', (e) => {
			if (checkKeyCodeDetected(e, KEY_ENTER)) {
				goToUrl();
			}
		});

		// set up key to dismiss find
		document.getElementById('find-box').addEventListener('keydown', (e) => {
			if (
				!document.getElementById('find-box').hidden &&
				e.key == 'Escape' &&
				!onlyCtrlDown
			) {
				hideFind();
			}
		});

		// set up keys for navigating find
		document.getElementById('find-input').addEventListener('keydown', (e) => {
			if (checkKeyCodeDetected(e, KEY_ENTER)) {
				findNext();
			}
		});

		// listen for CTRL+F for opening the find menu
		document.addEventListener('keydown', (e) => {
			onlyCtrlDown = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
			if ((e.key == 'F' || e.key == 'f') && onlyCtrlDown) {
				showFind();
			}
		});

		document.addEventListener('keyup', (e) => {
			onlyCtrlDown = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
		});

		document.getElementById('more').addEventListener('keydown', (e) => {
			if (!document.getElementById('extras-menu-pane').hidden) {
				const menuNavGroup = getNavGroupElems('extra-menu-nav');
				if (checkKeyCodeDetected(e, KEY_DOWN)) {
					menuNavGroup[0].focus();
				} else if (checkKeyCodeDetected(e, KEY_UP)) {
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
	 *
	 * @param {string} groupClassName the class name that is applied to elements of this nav group
	 * @returns
	 */
	function getNavGroupElems(groupClassName) {
		return Array.from(document.getElementsByClassName(groupClassName));
	}

	/**
	 * @param {string} url the URL to use to set the URL bar.
	 */
	function setURLBar(url) {
		document.getElementById('url-input').value = decodeURI(url);
	}

	/**
	 * @description Update the webview's state with the current pathname to allow correct serialize/deserialize.
	 * @param {string} pathname
	 */
	function updateState(pathname) {
		vscode.setState({ currentAddress: decodeURI(pathname) });
	}

	function goToUrl() {
		const linkTarget = document.getElementById('url-input').value;
		vscode.postMessage({
			command: 'go-to-file',
			text: linkTarget,
		});
	}

	/**
	 * @param {any} event the event processed
	 * @param {number} key the key to check for
	 * @returns whether the event includes the key pressed.
	 */
	function checkKeyCodeDetected(event, key) {
		return event.key === key;
	}

	/**
	 * Add keyboard listeners to navigation keys to allow arrow key navigation in the button groups.
	 * @param {HTMLElement[]} nav the navigation elements.
	 * @param {boolean} useRightLeft whether or not to navigate using right/left arrows. If false, uses up/down arrows.
	 */
	function handleNavGroup(nav, useRightLeft) {
		for (const [currIndex, elem] of nav.entries()) {
			elem.addEventListener('keydown', (e) => {
				if (checkKeyCodeDetected(e, useRightLeft ? KEY_LEFT : KEY_UP)) {
					moveFocusNav(false, nav, currIndex);
				} else if (
					checkKeyCodeDetected(e, useRightLeft ? KEY_RIGHT : KEY_DOWN)
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
		let numDisabled = 0,
			modifier = right ? 1 : -1,
			index = startIndex,
			newIndex = index;
		do {
			newIndex = Number(index) + modifier;
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
		let reachedElem = false;
		const leftMostNavGroup = getNavGroupElems('leftmost-nav');
		for (const elem of leftMostNavGroup) {
			if (!elem.disabled) {
				if (reachedElem) {
					elem.tabIndex = -1;
				} else {
					elem.tabIndex = 0;
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
					text: JSON.stringify({
						path: parsedMessage.path,
						port: parsedMessage.port,
					}),
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
			// from extension
			case 'refresh':
				document.getElementById('hostedContent').contentWindow.postMessage(
					JSON.stringify({
						command: 'setup-parent-listener',
					}),
					'*'
				);
				break;
			// from extension
			case 'changed-history': {
				const msgJSON = JSON.parse(message.text);
				if (msgJSON.element) {
					document.getElementById(msgJSON.element).disabled = msgJSON.disabled;
				}
				adjustTabIndex();
				break;
			}
			// from extension
			case 'set-url': {
				const msgJSON = JSON.parse(message.text);
				// setting a new address, ensure that previous link preview is gone
				document.getElementById('link-preview').hidden = true;
				setURLBar(msgJSON.fullPath);
				updateState(msgJSON.pathname);
				break;
			}
			// from child iframe
			case 'did-keydown': {
				handleKeyEvent('keydown', message.key);
				break;
			}
			// from child iframe
			case 'did-keyup': {
				handleKeyEvent('keyup', message.key);
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
					document.getElementById('link-preview').innerText = message.text;
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
					command: 'open-browser'
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
				const codicon = document.getElementById('find-result-icon');
				const iconClass = message.text ? 'codicon-pass' : 'codicon-error';

				if (!codicon.classList.contains(iconClass)) {
					codicon.className = `codicon ${iconClass}`;
					document.getElementById('find-result').hidden = true;
					fadeElement(true, document.getElementById('find-result'));
				}
				break;
			}
			// from child iframe
			case 'show-find': {
				showFind();
				break;
			}
		}
	}

	/**
	 * @description show the find menu
	 */
	function showFind() {
		if (document.getElementById('find-box').hidden) {
			fadeElement(true, document.getElementById('find-box'));
		}
		document.getElementById('find-input').focus();
	}

	/**
	 * @description hide the find menu
	 */
	function hideFind() {
		if (!document.getElementById('find-box').hidden) {
			fadeElement(false, document.getElementById('find-box'));
			document.getElementById('find-result').hidden = true;
		}
	}

	/**
	 * @description Fade in or out the link preview.
	 * @param {boolean} appear whether or not it should be fade from `hide -> show`; otherwise, will fade from `show -> hide`.
	 */
	function fadeElement(appear, elem) {
		const initOpacity = appear ? 0 : 1;
		const finalOpacity = appear ? 1 : 0;

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

	/**
	 * @description highlight the next find result on the page.
	 */
	function findNext() {
		document.getElementById('hostedContent').contentWindow.postMessage(
			{
				command: 'find-next',
				text: document.getElementById('find-input').value,
			},
			'*'
		);
	}

	/**
	 * @description highlight the previous find result on the page.
	 */
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
	 * @description Add click/keyboard listeners to all toolbar buttons.
	 */
	function addNavButtonListeners() {
		document.getElementById('back').addEventListener('click', () => {
			vscode.postMessage({
				command: 'go-back',
			});
		});

		document.getElementById('forward').addEventListener('click', () => {
			vscode.postMessage({
				command: 'go-forward',
			});
		});

		document.getElementById('reload').addEventListener('click', () => {
			document
				.getElementById('hostedContent')
				.contentWindow.postMessage({ command: 'refresh-forced' }, '*');
			document.getElementById('reload').blur();
		});

		document.getElementById('browser-open').addEventListener('click', () => {
			document.getElementById('extras-menu-pane').hidden = true;
			vscode.postMessage({
				command: 'open-browser'
			});
		});

		// close extra-menu-pane whenever not clicking on it
		// todo: fix to use addEventListener while still being able to hide menu on clicking elsewhere
		document.body.onblur = function (e) {
			document.getElementById('extras-menu-pane').hidden = true;
		};

		document.body.addEventListener('click', () => {
			document.getElementById('extras-menu-pane').hidden = true;
		});

		document
			.getElementById('extras-menu-pane')
			.addEventListener('click', (e) => {
				e.stopPropagation();
			});
		const menuNavGroup = getNavGroupElems('extra-menu-nav');

		for (const menuNavItem of menuNavGroup) {
			menuNavItem.addEventListener('mouseover', () => menuNavItem.focus());
		}

		document.getElementById('more').addEventListener('click', (e) => {
			const menuPane = document.getElementById('extras-menu-pane');
			menuPane.hidden = !menuPane.hidden;
			e.stopPropagation();
		});

		document.getElementById('devtools-open').addEventListener('click', () => {
			document.getElementById('extras-menu-pane').hidden = true;
			vscode.postMessage({
				command: 'devtools-open',
				text: '',
			});
		});

		document.getElementById('find').addEventListener('click', () => {
			document.getElementById('extras-menu-pane').hidden = true;
			showFind();
		});

		document
			.getElementById('find-next')
			.addEventListener('click', () => findNext());

		document
			.getElementById('find-prev')
			.addEventListener('click', () => findPrev());

		document
			.getElementById('find-x')
			.addEventListener('click', () => hideFind());
	}

	/**
	 * @description Create/displatch a keyboard event coming from child iframe.
	 */
	function handleKeyEvent(type, event) {
		const emulatedKeyboardEvent = new KeyboardEvent(type, event);
		Object.defineProperty(emulatedKeyboardEvent, 'target', {
			get: () => document,
		});
		window.dispatchEvent(emulatedKeyboardEvent);
	}
})();
