# Changelog
Changes have only been tracked starting from `v0.2.2`

## v0.2.2 (July 13, 2021)
- Adjusted "Open Automatically on Server Start" to take relative paths in workspace. [#74](https://github.com/microsoft/vscode-livepreview/pull/74)
- Fixed favicon display on external preview. [#76](https://github.com/microsoft/vscode-livepreview/pull/76)
- Fixed high CPU usage bug in external browser [#78](https://github.com/microsoft/vscode-livepreview/pull/78)

## v0.2.3 (July 15, 2021)
- Added support for watch scripts (e.g.: for Sass files). For this, use the "On Changes to Saved Files" option for the "Auto Refresh Preview" setting. [#82](https://github.com/microsoft/vscode-livepreview/pull/82)
- Piped `console` logging to Output Channel (Embedded Live Preview Console). [#83](https://github.com/microsoft/vscode-livepreview/pull/83), [#85](https://github.com/microsoft/vscode-livepreview/pull/85)

## v0.2.4 (July 21, 2021)
- Reduced `.vsix` size from ~25MB to ~200KB [#86](https://github.com/microsoft/vscode-livepreview/pull/86)
- Added keywords to `package.json` for better marketplace search. [#87](https://github.com/microsoft/vscode-livepreview/pull/87)
- Changed injected script to fetch from server for cleaner client code. [#93](https://github.com/microsoft/vscode-livepreview/pull/93)
- Added external browser debugging using `js-debug`. [#93](https://github.com/microsoft/vscode-livepreview/pull/93)
- Support `HTM/XHTML` files the same as HTML files. [#93](https://github.com/microsoft/vscode-livepreview/pull/93)

## 0.2.5 (TBD)
- General code cleanup. [#103](https://github.com/microsoft/vscode-livepreview/pull/103)
- Changed external debug preview to be the default external preview. [#105](https://github.com/microsoft/vscode-livepreview/pull/105)
  - Added "Debug on External Preview" to allow users to modify the default external browser behavior.