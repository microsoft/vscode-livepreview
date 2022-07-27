# Live Preview - VS Code Extension 📡

⚠️ WARNING: this extension is still under development! ⚠️

An extension that hosts a local server for you to preview your web projects on! 

Note: this extension is intended for projects where a server is not already created (e.g. not for apps using React, Angular, etc.). To work with these, feel free to run the `Simple Browser: Show` command that is already built-in with VS Code.

## Table of Contents
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Running the Extension](#running-the-extension)
- [FAQ](#faq)
- [Inspirations](#inspirations)
- [Issue Tracking](#issue-tracking)
- [Changelog](#changelog)

## Features
### HTML File Previewing
Preview your HTML files quickly by clicking the preview button in the top right corner of your editor or using the context menu.

![open-preview-btn](https://raw.githubusercontent.com/microsoft/vscode-livepreview/main/img/open-preview-btn.gif)
![open-context-menu](https://raw.githubusercontent.com/microsoft/vscode-livepreview/main/img/open-context-menu.gif)
### Embedded Preview
A preview is available in-editor for the files hosted by the server.

![browser-demo](https://raw.githubusercontent.com/microsoft/vscode-livepreview/main/img/browser-demo.gif)

The simple embedded browser features the following:
- Page history tracking 
- URL bar for address-based navigation
- Expandable menu, allowing users to:
	- Preview the current page in browser
	- Perform a page search
		- Tip: You can also use <kbd>CTRL</kbd>+<kbd>F</kbd> to open the find box and <kbd>Enter</kbd> to go to the next result
	- Open the editor's webview DevTools

![find-demo](https://raw.githubusercontent.com/microsoft/vscode-livepreview/main/img/find-demo.gif)

![webview-devtools-demo](https://raw.githubusercontent.com/microsoft/vscode-livepreview/main/img/webview-devtools-demo.gif)
### Live Refreshing
See the changes as you make them. By default, changes appear as you make them in the editor. You can also change this in settings to refresh the preview on save or not at all. 

![live-refresh](https://raw.githubusercontent.com/microsoft/vscode-livepreview/main/img/live-refresh.gif)

Individual pages can opt out of live refreshing by adding the `<body>` attribute `data-server-no-reload`.

### Persistent Server Task with Server Logging
If you're looking for a persistent server to run, you can run a `Live Preview` task, which can optionally log the server traffic. You can also click on the traffic to open the file location of the file returned by the server.

![task-demo](https://raw.githubusercontent.com/microsoft/vscode-livepreview/main/img/task-demo.gif)
![task-demo-2](https://raw.githubusercontent.com/microsoft/vscode-livepreview/main/img/task-demo-2.gif)

### External Browser Previewing
Although all of the images above use the embedded browser, you can also experience the same features in an external browser.

![external-window-demo](https://raw.githubusercontent.com/microsoft/vscode-livepreview/main/img/external-window-demo.gif)

You can edit the preview target in the extension settings.

### External Browser Debugging
The external browser preview also supports debugging via the built-in [js-debug](https://marketplace.visualstudio.com/items?itemName=ms-vscode.js-debug) extension and attaching to the [Edge Devtools Extension](https://marketplace.visualstudio.com/items?itemName=ms-edgedevtools.vscode-edge-devtools). This allows support for features such as setting breakpoints and inspecting elements. 

Run `Live Preview: Show Debug Preview` in the command palette to get these debugging features.

![external-debug-demo](https://raw.githubusercontent.com/microsoft/vscode-livepreview/main/img/external-debug-demo.gif)


## Console Output Channel (For Embedded Preview)
For a simple view of the embedded preview's console messages, go to the `Output` tab and select `Embedded Live Preview Console` in the dropdown.

![console-demo](https://raw.githubusercontent.com/microsoft/vscode-livepreview/main/img/console-demo.gif)

### Workspace-less Previewing
No workspace? No problem! For a quick preview of your file, the server can also access files outside of your workspace to preview. 

![no-workspace-preview](https://raw.githubusercontent.com/microsoft/vscode-livepreview/main/img/no-workspace-preview.gif)

Notes about workspace-less extension use:
- Linked files for these pages may not be correct if they are relative to a specific root (e.g. a project root). 
- Tasks do not work outside of a workspace, so a server will just launch in the background upon external preview when outside of a workspace. You can use the `Live Preview: Stop Server` command to kill the server in this case.

### Multi-root Support
The different workspaces will be assigned specific server endpoints, allowing you to easily preview files in all of your workspaces.

## Prerequisites
To use this extension, you must have [Node JS v14+](https://nodejs.org/en/download/). 
## Running the extension
You can install the extension [in the marketplace here](https://marketplace.visualstudio.com/items?itemName=ms-vscode.live-server). To contribute, see the [contributing page](https://github.com/microsoft/vscode-livepreview/blob/main/CONTRIBUTING.md).
## FAQ
Q. What does the `"Previewing a file that is not a child of the server root. To see fully correct relative file links, please open a workspace at the project root."` message mean?

A. Either:
- You have no workspace open and opened a preview.
- You opened a preview for a file that is not a part of your workspace(s).

Why does this happen? 

The server is hosted from the root of the workspace that the user opens. Files outside of this can be previewed, but some file paths (such as a link to the root) may not go to the right place. **If you are working on a web project, it is advised that you open a workspace at the root of the project.**

Q. I'm trying to use Live Preview in Codespaces and the embedded preview isn't working.

A. Currently, you will need to manually navigate to the links host the forwarded port content before it works

In the area of the editor where the integrated terminal usually is, navigate to `Ports` and open the local address in the browser. You can do this by using <kbd>CTRL</kbd>+<kbd>Click</kbd> on the URL in the `Ports` menu.

Allow the browser to perform the necessary redirects, then close the windows. Re-open the preview window and it _should_ work now.

## Inspirations
Special thanks to the following extensions for inspiring Live Preview! 💡
- [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer)
- [Five Server](https://marketplace.visualstudio.com/items?itemName=yandeu.five-server)
## Issue Tracking
Please file issues against the [VS Code Live Preview repository](https://github.com/microsoft/vscode-livepreview/issues).

## Changelog
See the project's changelog [here](https://github.com/microsoft/vscode-livepreview/blob/main/CHANGELOG.md).
