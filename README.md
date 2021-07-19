# Live Preview - VS Code Extension 📡

![Build](https://github.com/andreamah/VS-Code-LiveServer-V2-Extension/actions/workflows/build.yml/badge.svg)

⚠️ WARNING: this extension is still under initial development! Use at your own risk. ⚠️

An extension that hosts a local server for you to preview your web projects on! 

Note: this extension is intended for projects where a server is not already created (e.g. not for apps using React, Angular, etc.). To work with these, feel free to run the `Simple Browser: Show` command that is already built-in with VS Code.

## Table of Contents
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Running the Extension](#running-the-extension)
- [FAQ](#faq)
- [Issue Tracking](#issue-tracking)

## Features
### HTML File Previewing
Preview your HTML files quickly by clicking the preview button in the top right corner of your editor or using the context menu.

![open-preview-btn](https://raw.githubusercontent.com/microsoft/vscode-livepreview/main/img/open-preview-btn.gif)
![open-context-menu](https://raw.githubusercontent.com/microsoft/vscode-livepreview/main/img/open-context-menu.gif)
### Embedded Preview
A preview is available in-editor for the files hosted by the server. The simple embedded browser features history tracking, a url bar, and a button to open the preview externally. 

![browser-demo](https://raw.githubusercontent.com/microsoft/vscode-livepreview/main/img/browser-demo.gif)
### Live Refreshing
See the changes as you make them. By default, changes appear as you make them in the editor. You can also change this in settings to refresh the preview on save or not at all. 

![live-refresh](https://raw.githubusercontent.com/microsoft/vscode-livepreview/main/img/live-refresh.gif)
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

## Inspirations
Special thanks to the following extensions for inspiring Live Preview! 💡
- [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer)
- [Five Server](https://marketplace.visualstudio.com/items?itemName=yandeu.five-server)
## Issue Tracking
Please file issues against the [VS Code Live Preview repository](https://github.com/microsoft/vscode-livepreview/issues).