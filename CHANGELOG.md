# Changelog

## 0.4.15 (September 5, 2024)

- Bump `webpack` and `micromatch` dependencies.

## 0.4.14 (July 3, 2024)

- Bump `braces` and `ws` dependencies.

## 0.4.13 (December 11, 2023)

- Revert `require-corp` header to fix iframe, video, and image linking [#579](https://github.com/microsoft/vscode-livepreview/issues/579) [#578](https://github.com/microsoft/vscode-livepreview/issues/578) [#577](https://github.com/microsoft/vscode-livepreview/issues/577)

## 0.4.12 (December 6, 2023)

- Progress on adding CORP headers for `COI=true` on codespaces [#560](https://github.com/microsoft/vscode-livepreview/issues/560)

## 0.4.11 (October 4, 2023)

- Fix 401 on Codespaces. [#546](https://github.com/microsoft/vscode-livepreview/issues/546)
- Support `Content-Length` header. [#549](https://github.com/microsoft/vscode-livepreview/issues/549)

## 0.4.10 (August 3, 2023)

- Fix silent fail on custom external browser not found. [#421](https://github.com/microsoft/vscode-livepreview/issues/421)

## 0.4.9 (July 5, 2023)

- Fix custom external browser open in remote. [#517](https://github.com/microsoft/vscode-livepreview/issues/517)
- Fix out-of-workspace file external browser preview. [#509](https://github.com/microsoft/vscode-livepreview/issues/509)
- Reduce injected script line number clobber for external browser preview. [#508](https://github.com/microsoft/vscode-livepreview/issues/508)

## 0.4.8 (May 3, 2023)

- Add option to customize HTTP headers to support cross-origin isolation. [#375](https://github.com/microsoft/vscode-livepreview/issues/375)
- Edit logic for workspace find for `livePreview.start` [#455](https://github.com/microsoft/vscode-livepreview/issues/455)

## 0.4.7 (March 15, 2023)

- Fixed out-of-workspace preview for UNIX paths. [#464](https://github.com/microsoft/vscode-livepreview/issues/464)

## 0.4.6 (March 1, 2023)

- Added `livePreview.previewDebounceDelay` setting to control refresh debounce. Set 50ms default debounce. [#174](https://github.com/microsoft/vscode-livepreview/issues/174)
- Fixed page history skip on non-html page. [#444](https://github.com/microsoft/vscode-livepreview/issues/444)
- Changed `livePreview.defaultPreviewPath` to use relative path and be scoped to resource. [#274](https://github.com/microsoft/vscode-livepreview/issues/274) [#438](https://github.com/microsoft/vscode-livepreview/issues/438)
- Fixed out-of-workspace bug with UNC files. [#326](https://github.com/microsoft/vscode-livepreview/issues/326)

## 0.4.5 (February 1, 2023)

- Added `livePreview.serverRoot` setting to specify server root in subfolder of workspace. [#155](https://github.com/microsoft/vscode-livepreview/issues/155)
- Added `livePreview.customExternalBrowser` setting to specify external browser type (if different from default browser). [#69](https://github.com/microsoft/vscode-livepreview/issues/69)
- Added `livePreview.start.preview.atFileString` command that takes an absolute or relative path string as an argument and opens the file in the preview. [#388](https://github.com/microsoft/vscode-livepreview/issues/388)

## 0.4.4 (October 31, 2022)

- Fixed 401 error in Codespaces. [#369](https://github.com/microsoft/vscode-livepreview/issues/369)
- Fixed external preview open when server is closed. [#370](https://github.com/microsoft/vscode-livepreview/issues/370)

## 0.4.3 (October 7, 2022)

- Fixed 401 error in loading content with origin header. [#359](https://github.com/microsoft/vscode-livepreview/issues/359)
- Fixed missing commands for opening in external preview. [#360](https://github.com/microsoft/vscode-livepreview/issues/360)

## 0.4.2 (October 5, 2022)

- Added ability to open external preview from while focused on embedded preview through command palette. [#303](https://github.com/microsoft/vscode-livepreview/issues/303)
- Fixed server launch while the server is already launching. [#324](https://github.com/microsoft/vscode-livepreview/issues/324)
- Fixed bug where clicking on the "started on" URL in the task terminal doesn't open in default preview. [#322](https://github.com/microsoft/vscode-livepreview/issues/322)
- Added command to run Live Preview server logging task. [#315](https://github.com/microsoft/vscode-livepreview/issues/315)
- Fixed unicode character rendering in task terminal. [#254](https://github.com/microsoft/vscode-livepreview/issues/254)
- Commands use URI arguments instead of strings. [#320](https://github.com/microsoft/vscode-livepreview/issues/320)
- Changed query parsing and host checking.

# 0.4.1 (September 13, 2022)

- Changed nonce generation and link preview code.

## 0.4.0 (August 30, 2022)

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
