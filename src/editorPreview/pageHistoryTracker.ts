import { Disposable } from '../utils/dispose';
import { PathUtil } from '../utils/pathUtil';

export enum NavEditCommands {
	DISABLE_BACK,
	ENABLE_BACK,
	DISABLE_FORWARD,
	ENABLE_FORWARD,
}
export interface NavResponse {
	actions: Array<NavEditCommands>;
	address?: string;
}
export class PageHistory extends Disposable {
	private _history = new Array<string>();
	private _backstep = 0;
	private _current_back_enabled = false;
	private _current_forward_enabled = false;

	public get currentCommands(): Array<NavEditCommands> {
		const action = new Array<NavEditCommands>();

		if (this._current_back_enabled) {
			action.push(NavEditCommands.ENABLE_BACK);
		} else {
			action.push(NavEditCommands.DISABLE_BACK);
		}

		if (this._current_forward_enabled) {
			action.push(NavEditCommands.ENABLE_FORWARD);
		} else {
			action.push(NavEditCommands.DISABLE_FORWARD);
		}

		return action;
	}

	public goForward(): NavResponse {
		const action = new Array<NavEditCommands>();
		if (this._backstep > 0) {
			const path = this._history[this._backstep - 1];
			this._backstep -= 1;

			// if we reached 0, this means we can't go forwards anymore
			if (this._backstep == 0) {
				action.push(NavEditCommands.DISABLE_FORWARD);
				this._current_forward_enabled = false;
			}

			// if reached the second-last entry, we can now go backwards
			if (this._backstep == this._history.length - 2) {
				action.push(NavEditCommands.ENABLE_BACK);
				this._current_back_enabled = true;
			}
			return { actions: action, address: path };
		} else {
			return { actions: action };
		}
	}

	public goBackward(): NavResponse {
		const action = new Array<NavEditCommands>();
		if (this._backstep < this._history.length - 1) {
			const path = this._history[this._backstep + 1];
			this._backstep += 1;

			// if we reached the last entry, we can't go back any more
			if (this._backstep == this._history.length - 1) {
				action.push(NavEditCommands.DISABLE_BACK);
				this._current_back_enabled = false;
			}
			// if we reached 1, we can now go forwards
			if (this._backstep == 1) {
				action.push(NavEditCommands.ENABLE_FORWARD);
				this._current_forward_enabled = true;
			}
			return { actions: action, address: path };
		} else {
			return { actions: action };
		}
	}

	public addHistory(address: string): NavResponse | undefined {
		address = address.replace(/\\/g, '/');
		address = PathUtil.EscapePathParts(address);
		const action = new Array<NavEditCommands>();
		if (
			this._backstep < this._history.length &&
			address == this._history[this._backstep]
		) {
			// if this is the same as the last entry or is a
			// redirect of the previous, don't add to history
			return undefined;
		}
		if (this._backstep > 0) {
			this._history = this._history.slice(this._backstep);
		}
		if (this._history.length == 1) {
			action.push(NavEditCommands.ENABLE_BACK);
			this._current_back_enabled = true;
		}
		this._history.unshift(address);
		this._backstep = 0;
		action.push(NavEditCommands.DISABLE_FORWARD);
		this._current_forward_enabled = false;

		return { actions: action };
	}
}
