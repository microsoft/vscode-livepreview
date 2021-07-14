export enum TerminalColor {
	red = 31,
	green = 32,
	yellow = 33,
	blue = 34,
	purple = 35,
	cyan = 36,
}
export enum TerminalDeco {
	reset = 0,
	bold = 1,
	underline = 4,
}

export class TerminalStyleUtil {
	public static ColorTerminalString(
		input: string,
		color: TerminalColor,
		decoration = TerminalDeco.reset
	) {
		return `\x1b[${decoration};${color}m${input}\x1b[0m`;
	}
}


