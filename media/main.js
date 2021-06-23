/* eslint-disable no-undef */
// This script will be run within the webview itself

// It cannot access the main VS Code APIs directly.
(function () {
	const vscode = acquireVsCodeApi();
	const connection = new WebSocket(WS_URL);
	onLoad();

	function onLoad() {
		updateState(window.location.pathname);

		connection.onerror = (error) => {
			console.log('WebSocket error: ');
			console.log(error);
		};

		connection.onmessage = (e) => handleSocketMessage(e);

		document.addEventListener('DOMContentLoaded', function (e) {
			vscode.postMessage({
				command: 'refresh-back-forward-buttons',
			});
		});

		addNavButtonListeners();

		document
			.getElementById('url-input')
			.addEventListener('keyup', handleKeyUp);

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

	function handleSocketMessage(data) {
		const parsedMessage = JSON.parse(e.data);
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

	function handleMessage(message) {
		switch (message.command) {
			case 'refresh':
				document
					.getElementById('hostedContent')
					.contentWindow.postMessage('refresh', '*');
				break;
			case 'enable-back':
				document.getElementById('back').disabled = false;
				break;
			case 'disable-back':
				document.getElementById('back').disabled = true;
				break;
			case 'enable-forward':
				document.getElementById('forward').disabled = false;
				break;
			case 'disable-forward':
				document.getElementById('forward').disabled = true;
				break;
			// from child iframe
			case 'update-path': {
				msgJSON = JSON.parse(message.text);
				vscode.postMessage({
					command: 'update-path',
					text: message.text,
				});
				setURLBar(msgJSON.fullPath.href);
				updateState(msgJSON.pathname);
				break;
			}
			case 'set-url': {
				msgJSON = JSON.parse(message.text);
				setURLBar(msgJSON.fullPath);
				updateState(msgJSON.pathname);
				break;
			}
			case 'open-external-link': {
				vscode.postMessage({
					command: 'open-browser',
					text: message.text,
				});

				break;
			}
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
		};

		document.getElementById('browserOpen').onclick = function () {
			vscode.postMessage({
				command: 'open-browser',
				text: '',
			});
		};
	}
})();
