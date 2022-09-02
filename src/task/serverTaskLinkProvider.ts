import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { URL } from 'url';
import { Disposable } from '../utils/dispose';
import TelemetryReporter from 'vscode-extension-telemetry';
import { EndpointManager } from '../infoManagers/endpointManager';
import { SETTINGS_SECTION_ID } from '../utils/settingsUtil';
import { ConnectionManager } from '../connectionInfo/connectionManager';
import { PathUtil } from '../utils/pathUtil';
import { Connection } from '../connectionInfo/connection';
import { ServerTaskProvider } from './serverTaskProvider';
import { TASK_TERMINAL_BASE_NAME } from '../utils/constants';
import { IOpenFileOptions } from '../manager';

const localize = nls.loadMessageBundle();

/**
 * @description the link provider that runs on Live Preview's `Run Server` task
 */
export class serverTaskLinkProvider
	extends Disposable
	implements vscode.TerminalLinkProvider
{
	// Triggers the editor to open a file, but to the side of the preview,
	// which means that the manager must use the panel column info from the preview
	// to open the file in a column where the preview is not.
	private readonly _onRequestOpenEditorToSide = this._register(
		new vscode.EventEmitter<vscode.Uri>()
	);
	public readonly onRequestOpenEditorToSide =
		this._onRequestOpenEditorToSide.event;

	private readonly _onShouldLaunchPreview = this._register(
		new vscode.EventEmitter<{
			file?: vscode.Uri | string;
			options?: IOpenFileOptions;
			previewType?: string;
		}>()
	);
	public readonly onShouldLaunchPreview = this._onShouldLaunchPreview.event;

	constructor(
		private readonly _reporter: TelemetryReporter,
		private readonly _endpointManager: EndpointManager,
		private readonly _connectionManager: ConnectionManager
	) {
		super();
		vscode.window.registerTerminalLinkProvider(this);
	}

	public async provideTerminalLinks(
		context: vscode.TerminalLinkContext,
		token: vscode.CancellationToken
	): Promise<vscode.TerminalLink[]> {
		const links = new Array<vscode.TerminalLink>();
		if (
			!context.terminal.creationOptions.name ||
			!this._isLivePreviewTerminal(context.terminal.creationOptions.name)
		) {
			return links;
		}

		this._connectionManager.connections.forEach((connection) => {
			this._findFullLinkRegex(context.line, links, connection.httpPort);
		});

		this._findPathnameRegex(context.line, links);
		return links;
	}

	public async handleTerminalLink(link: any): Promise<void> {
		/* __GDPR__
			"task.terminal.handleTerminalLink" : {}
		*/
		this._reporter.sendTelemetryEvent('task.terminal.handleTerminalLink');

		if (link.inEditor) {
			this._openRelativeLinkInWorkspace(link.data, link.isDir);
		} else {
			this._onShouldLaunchPreview.fire({ file: link.data });
		}
	}

	/**
	 * @param {string} terminalName the terminal name of the target terminal
	 * @returns Whether it is a task terminal from the `Live Preview - Run Server` task.
	 */
	private _isLivePreviewTerminal(terminalName: string): boolean {
		return terminalName.indexOf(TASK_TERMINAL_BASE_NAME) != -1; // there may be additional terminal text in a multi-root workspace
	}

	/**
	 * Collects the printed pathnames (e.g. `/file.html`) as terminal links.
	 * @param {string} input the line read from the terminal.
	 * @param {Array<vscode.TerminalLink>} links the array of links (pass-by-reference) that are added to.
	 */
	private _findPathnameRegex(
		input: string,
		links: Array<vscode.TerminalLink>
	): void {
		// match relative links
		const partialLinkRegex = new RegExp(
			`(?<=\\s)\\/([^\\0<>\\?\\|\\s!\`&*()\\[\\]'":;]*)\\?*[\\w=]*`,
			'g'
		);
		let partialLinkMatches: RegExpExecArray | null;
		do {
			partialLinkMatches = partialLinkRegex.exec(input);
			if (partialLinkMatches) {
				for (let i = 0; i < partialLinkMatches.length; i++) {
					if (partialLinkMatches[i]) {
						const queryIndex = partialLinkMatches[i].lastIndexOf('?');
						const link =
							queryIndex == -1
								? partialLinkMatches[i]
								: partialLinkMatches[i].substr(0, queryIndex);
						const isDir = link.endsWith('/');
						const tooltip = isDir ? 'Reveal Folder ' : 'Open File ';
						const tl = {
							startIndex: partialLinkMatches.index,
							length: partialLinkMatches[i].length,
							tooltip: tooltip,
							data: link,
							inEditor: true,
							isDir: isDir,
						};
						links.push(tl);
					}
				}
			}
		} while (partialLinkMatches);
	}

	/**
	 * Detects the host address (e.g. http://127.0.0.1:3000) as a terminal link.
	 * @param {string} input the line read from the terminal.
	 * @param {Array<vscode.TerminalLink>} links the array of links (pass-by-reference) that are added to.
	 */

	private _findFullLinkRegex(
		input: string,
		links: Array<vscode.TerminalLink>,
		host: number
	): void {
		const fullLinkRegex = new RegExp(
			`\\b\\w{2,20}:\\/\\/(?:localhost|${host}|:\\d{2,5})[\\w\\-.~:/?#[\\]@!$&()*+,;=]*`,
			'g'
		);

		let fullURLMatches: RegExpExecArray | null;
		do {
			fullURLMatches = fullLinkRegex.exec(input);
			if (fullURLMatches) {
				for (let i = 0; i < fullURLMatches.length; i++) {
					if (fullURLMatches[i]) {
						const url = new URL(fullURLMatches[i]);
						const tl = {
							startIndex: fullURLMatches.index,
							length: fullURLMatches[i].length,
							tooltip: localize('openInPreview', 'Open in Preview'),
							data: url.pathname + url.search,
							inEditor: false,
						};
						links.push(tl);
					}
				}
			}
		} while (fullURLMatches);
	}

	/**
	 * Opens a terminal link in the editor.
	 * Expected behavior:
	 * - If it's a filename, show files by opening them in editor.
	 * - If it's a directory, highlight it in the file explorer. Will show an error if that directory is not in the current workspace(s).
	 * @param {string} file the path to open in the editor
	 * @param {boolean} isDir whether it is a directory.
	 */
	private _openRelativeLinkInWorkspace(file: string, isDir: boolean): void {
		file = unescape(file);
		const workspace = PathUtil.PathExistsRelativeToAnyWorkspace(file);

		const fullPath = workspace
			? workspace?.uri + file
			: 'file:///' + this._endpointManager.decodeLooseFileEndpoint(file);

		const uri = vscode.Uri.parse(fullPath);

		if (isDir) {
			if (!PathUtil.AbsPathInAnyWorkspace(uri.fsPath)) {
				vscode.window.showErrorMessage(
					'Cannot reveal folder. It is not in the open workspace.'
				);
			} else {
				vscode.commands.executeCommand('revealInExplorer', uri);
			}
		} else {
			this._onRequestOpenEditorToSide.fire(uri);
		}
	}
}
