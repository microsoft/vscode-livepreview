# Changelog

## 0.4.1 (September 13, 2022)
- Changed nonce generation and link preview code

## 0.4.0 (August 31, 2022)
- Added better multi-root support that opens a new server for each root. Paths relative to the root now work on multi-root. [#143](https://github.com/microsoft/vscode-livepreview/issues/143)
- Localization support. [#221](https://github.com/microsoft/vscode-livepreview/issues/221)
- Status bar setting removed in favor of using VS Code's native functionality to hide status bar contributions. [#269](https://github.com/microsoft/vscode-livepreview/issues/269)
- Fixed debug to track breakpoint on correct line. [#295](https://github.com/microsoft/vscode-livepreview/issues/295)
- Removed extension activation triggerring when simply on an HTML file. [#272](https://github.com/microsoft/vscode-livepreview/issues/272)

## 0.2.13 (July 29, 2022)
- Support Unicode characters (e.g. Chinese characters) in filenames. [#131](https://github.com/microsoft/vscode-livepreview/issues/131)
- Page-based opt-out of live refreshing using the `data-server-no-reload` body attribute. [#241](https://github.com/microsoft/vscode-livepreview/issues/241)

## 0.2.12 (January 11, 2022)
- Use random path for the WebSocket server. [#193](https://github.com/microsoft/vscode-livepreview/issues/193)

## 0.2.11 (December 2, 2021)
- Reverted the change to support IPv6 addresses using the `livePreview.hostIP` setting. [#179](https://github.com/microsoft/vscode-livepreview/issues/179)

## 0.2.10 (November 29, 2021)
- Added support for IPv6 addresses to the `livePreview.hostIP` setting. [#179](https://github.com/microsoft/vscode-livepreview/issues/179)
- Fixed an issue with dismissing the search widget when pressing the Esc key. [#130](https://github.com/microsoft/vscode-livepreview/issues/130)
- Fixed an issue with using keybindings when focused on embedded preview. [#119](https://github.com/microsoft/vscode-livepreview/issues/119)

## 0.2.9 (September 30, 2021)
- Fixed an issue with the find widget icon background. [#156](https://github.com/microsoft/vscode-livepreview/issues/156)
- Fixed an issue that causes the find widget to flicker while navigating through matches. [#157](https://github.com/microsoft/vscode-livepreview/issues/157)

## 0.2.8 (August 12, 2021)
- Fixed Custom IP Error on Local Session. [#140](https://github.com/microsoft/vscode-livepreview/pull/#140)
- Fixed Identical Task Names. [#141](https://github.com/microsoft/vscode-livepreview/pull/#141)

## 0.2.7 (August 5, 2021)
- Print exceptions to console. [#134](https://github.com/microsoft/vscode-livepreview/pull/134)
- Improve logging of functions. [#135](https://github.com/microsoft/vscode-livepreview/pull/135)

## 0.2.6 (July 28, 2021)
- Restricted remote sessions from hosting on custom IP host. [#123](https://github.com/microsoft/vscode-livepreview/pull/123)
- Cleaned up injected script to reduce global variables. [#124](https://github.com/microsoft/vscode-livepreview/pull/125)

## 0.2.5 (July 26, 2021)
- General code cleanup. [#103](https://github.com/microsoft/vscode-livepreview/pull/103)
- Added "Debug on External Preview" to allow users to modify the default external browser behavior. [#105](https://github.com/microsoft/vscode-livepreview/pull/105)
- Changed activation to require user to be on HTML file rather than if the workspace contains an HTML file. [#110](https://github.com/microsoft/vscode-livepreview/pull/110)
- Added "Find in page" functionality. [#115](https://github.com/microsoft/vscode-livepreview/pull/115)
- Added expandable menu with various command options in place of "open in browser" icon in top right conder of embedded preview. [#115](https://github.com/microsoft/vscode-livepreview/pull/115)
- Added shortcut to open webview devtools in editor. [#115](https://github.com/microsoft/vscode-livepreview/pull/115)
- Added option to configure host IP address. [#117](https://github.com/microsoft/vscode-livepreview/pull/117)

## 0.2.4 (July 21, 2021)
- Reduced `.vsix` size from ~25MB to ~200KB [#86](https://github.com/microsoft/vscode-livepreview/pull/86)
- Added keywords to `package.json` for better marketplace search. [#87](https://github.com/microsoft/vscode-livepreview/pull/87)
- Changed injected script to fetch from server for cleaner client code. [#93](https://github.com/microsoft/vscode-livepreview/pull/93)
- Added external browser debugging using `js-debug`. [#93](https://github.com/microsoft/vscode-livepreview/pull/93)
- Support `HTM/XHTML` files the same as HTML files. [#93](https://github.com/microsoft/vscode-livepreview/pull/93)

## 0.2.3 (July 15, 2021)
- Added support for watch scripts (e.g.: for Sass files). For this, use the "On Changes to Saved Files" option for the "Auto Refresh Preview" setting. [#82](https://github.com/microsoft/vscode-livepreview/pull/82)
- Piped `console` logging to Output Channel (Embedded Live Preview Console). [#83](https://github.com/microsoft/vscode-livepreview/pull/83), [#85](https://github.com/microsoft/vscode-livepreview/pull/85)

## 0.2.2 (July 13, 2021)
- Adjusted "Open Automatically on Server Start" to take relative paths in workspace. [#74](https://github.com/microsoft/vscode-livepreview/pull/74)
- Fixed favicon display on external preview. [#76](https://github.com/microsoft/vscode-livepreview/pull/76)
- Fixed high CPU usage bug in external browser [#78](https://github.com/microsoft/vscode-livepreview/pull/78)


Changes have only been tracked starting from `v0.2.2`
