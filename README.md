# LiveServer v2 - Visual Studio Code Extension

![Build](https://github.com/andreamah/VS-Code-LiveServer-V2-Extension/actions/workflows/build.yml/badge.svg)

A simple live server hosting extension for static HTML/CSS Projects.

The goal of the extension is to allow local previews of web projects (ie: HTML/CSS/JS-based projects). The extension should support similar functionalities to that of the existing [vscode-live-server](https://github.com/ritwickdey/vscode-live-server); however, it should show the preview in an extra column within the VS Code window (amongst other optimizations).

Based off of the webview template found [here](https://github.com/microsoft/vscode-extension-samples/tree/main/webview-sample).

Issues are currently being tracked on the [June Iteration Ticket](https://github.com/microsoft/vscode/issues/124608)
## Running the extension
- Open this example in VS Code 1.47+
- `npm install`
- `npm run watch` or `npm run compile`
- <kbd>F5</kbd> to start debugging

## Using the extension
Run commands using the command palette using <kbd>CTRL</kbd>+<kbd>SHIFT</kbd>+<kbd>P</kbd>
Action | Command 
:----- | :---- 
Starting the server on port 3000   | `LiveServer v2: Start Development Server` 
Closing the server | `LiveServer v2: Close Development Server`
Viewing the embedded preview (does not require manually starting the server)  | `LiveServer v2: Show Preview`  

[![Image from Gyazo](./release_notes/images/live-server-v0_1-overview.gif)](https://gyazo.com/a3796821f5cc2ea2164725457d26f45c)

## Issue Tracking:
- [May Iteration](https://github.com/microsoft/vscode/issues/124607)
- [June Iteration](https://github.com/microsoft/vscode/issues/124608)
- [Backlog](https://github.com/microsoft/vscode/issues/125343)