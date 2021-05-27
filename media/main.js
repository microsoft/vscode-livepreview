
// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
	const vscode = acquireVsCodeApi();


	document.getElementById('back').onclick = function() {
		vscode.postMessage({
			command: 'go-back',
		});
	}
	
	document.getElementById('forward').onclick = function() {
		vscode.postMessage({
			command: 'go-forward',
		});
	}
	
	document.getElementById('reload').onclick = function() {
		document.getElementById('hostedContent').contentWindow.postMessage('refresh', "*");
	}

	document.getElementById('browserOpen').onclick = function() {
		vscode.postMessage({
			command: 'open-browser',
			text: ''
		});
	}

	window.addEventListener('message', event => {
		
        const message = event.data; // The json data that the extension sent
		console.log(message.command)
        switch (message.command) {
            case 'refresh':
				document.getElementById('hostedContent').contentWindow.postMessage('refresh', "*");
                break;
			case 'enable-back':
				document.getElementById('back').disabled = false;
				break;
			case 'disable-back':
				console.log("disabling back")
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
				vscode.postMessage({
					command: 'update-path',
					text: message.text
				});
				break;
			}
			case 'open-external-link': {
				console.log('open-ex-link')
				vscode.postMessage({
					command: 'open-browser',
					text: message.text
				});
				
				break;
			}
        }
    });
}());


