import { Disposable } from "../utils/dispose";
import * as vscode from 'vscode';
import TelemetryReporter from "vscode-extension-telemetry";
import { PathUtil } from "../utils/pathUtil";
import { EndpointManager } from "../server/serverUtils/endpointManager";
import { HOST } from "../utils/constants";
import { URL } from "url";
export class serverTaskLinkProvider extends Disposable implements vscode.TerminalLinkProvider {
	public terminalName;

	constructor(terminalName:string, private readonly _reporter: TelemetryReporter,
		private readonly _endpointManager: EndpointManager) {
		super();
		this.terminalName = terminalName;
		vscode.window.registerTerminalLinkProvider(this);
	}

	private isPtyTerm(terminal: string) {
		return this.terminalName = terminal;
	}
	async provideTerminalLinks(
		context: vscode.TerminalLinkContext,
		token: vscode.CancellationToken
	) {
		const links = new Array<vscode.TerminalLink>();
		if (
			!context.terminal.creationOptions.name ||
			!this.isPtyTerm(context.terminal.creationOptions.name)
		) {
			return links;
		}
	
		this.findFullLinkRegex(context.line, links);
		this.findPathnameRegex(context.line, links);
		return links;
	}

	async handleTerminalLink (link: any) {
		/* __GDPR__
			"task.terminal.handleTerminalLink" : {}
		*/
		this._reporter.sendTelemetryEvent('task.terminal.handleTerminalLink');
		if (link.inEditor) {
			this.openRelativeLinkInWorkspace(link.data, link.isDir);
		} else {
			vscode.commands.executeCommand(
				'LiveServer.start.preview.atFile',
				link.data
			);
		}
	}

	private findPathnameRegex(
		input: string,
		links: Array<vscode.TerminalLink>
	) {
		// match relative links
		const partialLinkRegex = new RegExp(
			`(?<=\\s)\\/([/(\\w%\\-.)]*)\\?*[\\w=]*`,
			'g'
		);
		let partialLinkMatches;
		do {
			partialLinkMatches = partialLinkRegex.exec(input);
			if (partialLinkMatches) {
				for (let i = 0; i < partialLinkMatches.length; i++) {
					if (partialLinkMatches[i]) {
						const link = partialLinkMatches[i];
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
	
	private openRelativeLinkInWorkspace(
		file: string,
		isDir: boolean
	) {
		const isWorkspaceFile = PathUtil.PathExistsRelativeToWorkspace(file);
		const fullPath = isWorkspaceFile
			? PathUtil.GetWorkspace()?.uri + file
			: 'file:///' + this._endpointManager.decodeLooseFileEndpoint(file);
	
		const uri = vscode.Uri.parse(fullPath);
	
		if (isDir) {
			if (!isWorkspaceFile) {
				vscode.window.showErrorMessage(
					'Cannot reveal folder. It is not in the open workspace.'
				);
			}
			vscode.commands.executeCommand('revealInExplorer', uri);
		} else {
			vscode.commands.executeCommand('vscode.open', uri);
		}
	}

	private findFullLinkRegex(
		input: string,
		links: Array<vscode.TerminalLink>
	) {
		const fullLinkRegex = new RegExp(
			`\\b\\w{2,20}:\\/\\/(?:localhost|${HOST}|:\\d{2,5})[\\w\\-.~:/?#[\\]@!$&()*+,;=]*`,
			'g'
		);
	
		let fullURLMatches;
		do {
			fullURLMatches = fullLinkRegex.exec(input);
			if (fullURLMatches) {
				for (let i = 0; i < fullURLMatches.length; i++) {
					if (fullURLMatches[i]) {
						const url = new URL(fullURLMatches[i]);
						const tl = {
							startIndex: fullURLMatches.index,
							length: fullURLMatches[i].length,
							tooltip: `Open in Preview `,
							data: url.pathname + url.search,
							inEditor: false,
						};
						links.push(tl);
					}
				}
			}
		} while (fullURLMatches);
	}

}
