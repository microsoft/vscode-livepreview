/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from './utils/dispose';
import * as vscode from 'vscode';
import { UriSchemes } from './utils/constants';
import { AutoRefreshPreview, SettingUtil } from './utils/settingsUtil';
import { PathUtil } from './utils/pathUtil';

/**
 * Listens for any file changes within:
 * - workspace files in any workspace
 * - files that are open
 */
export class UpdateListener extends Disposable {
	private readonly _watcher;
	private _debounceTimer: NodeJS.Timeout | undefined;
	private _debounceDelay: number;

	private readonly _shouldRefreshPreviews = this._register(
		new vscode.EventEmitter<void>()
	);

	public readonly shouldRefreshPreviews = this._shouldRefreshPreviews.event;

	constructor(_userDataDir: string | undefined) {
		super();
		this._watcher = vscode.workspace.createFileSystemWatcher('**');

		const notUserDataDirChange = function (file: vscode.Uri): boolean {
			return (
				file.scheme != UriSchemes.vscode_userdata &&
				(!_userDataDir || !PathUtil.PathBeginsWith(file.fsPath, _userDataDir))
			);
		};
		this._debounceDelay = SettingUtil.GetConfig().previewDebounceDelay;

		this._register(
			vscode.workspace.onDidChangeTextDocument((e) => {
				if (
					e.contentChanges &&
					e.contentChanges.length > 0 &&
					(e.document.uri.scheme == UriSchemes.file ||
						e.document.uri.scheme == UriSchemes.untitled) &&
					this._reloadOnAnyChange
				) {
					this._refreshPreview();
				}
			})
		);

		this._register(
			vscode.workspace.onDidSaveTextDocument((e) => {
				this._reloadIfOutOfWorkspace(e.uri);
			})
		);

		this._register(
			vscode.workspace.onDidCreateFiles((e) => {
				for (const file of e.files) {
					this._reloadIfOutOfWorkspace(file);
				}
			})
		);

		this._register(
			vscode.workspace.onDidDeleteFiles((e) => {
				for (const file of e.files) {
					this._reloadIfOutOfWorkspace(file);
				}
			})
		);

		this._register(
			this._watcher.onDidChange((e) => {
				if (this._reloadOnSave && notUserDataDirChange(e)) {
					this._refreshPreview();
				}
			})
		);

		this._register(
			this._watcher.onDidDelete((e) => {
				if (
					(this._reloadOnAnyChange || this._reloadOnSave) &&
					notUserDataDirChange(e)
				) {
					this._refreshPreview();
				}
			})
		);

		this._register(
			this._watcher.onDidCreate((e) => {
				if (
					(this._reloadOnAnyChange || this._reloadOnSave) &&
					notUserDataDirChange(e)
				) {
					this._refreshPreview();
				}
			})
		);

		this._register(
			vscode.workspace.onDidChangeConfiguration((e) => {
				this._debounceDelay =
					SettingUtil.GetConfig().previewDebounceDelay;
			})
		);
	}

	/**
	 * @description whether to reload on any change from the editor.
	 */
	private get _reloadOnAnyChange(): boolean {
		return (
			SettingUtil.GetConfig().autoRefreshPreview ==
			AutoRefreshPreview.onAnyChange
		);
	}

	/**
	 * @description whether to reload on file save.
	 */
	private get _reloadOnSave(): boolean {
		return (
			SettingUtil.GetConfig().autoRefreshPreview == AutoRefreshPreview.onSave
		);
	}

	/**
	 * Usually called if this._watcher would have also triggered. Makes sure it doesn't re-trigger a refresh if a refresh is already underway
	 * @param uri
	 */
	private _reloadIfOutOfWorkspace(uri: vscode.Uri): void {
		if (!PathUtil.GetWorkspaceFromURI(uri)) {
			this._refreshPreview();
		}
	}

	private _refreshPreview(): void {
		clearTimeout(this._debounceTimer);
		this._debounceTimer = setTimeout(() => { this._shouldRefreshPreviews.fire(); }, this._debounceDelay);
	}
}
