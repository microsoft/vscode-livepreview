import { Disposable } from './dispose';

export enum NavEditCommands {
	DISABLE_BACK,
	ENABLE_BACK,
	DISABLE_FORWARD,
	ENABLE_FORWARD
}
export interface NavResponse {
	actions: Array<NavEditCommands>;
	address?: string
}
export class pageHistory extends Disposable {
	private _history = new Array<string>();
	private _backstep = 0;

	public clearHistory() {
		this._history = [];
	}

	public canGoBack() {
		return (this._backstep != (this._history.length - 1));
	}

	public goForward(): NavResponse {
		const action = new Array<NavEditCommands>();
		if (this._backstep > 0) {
			const path = this._history[this._backstep - 1];
			this._backstep -= 1;


			// if we reached 0, this means we can't go forwards anymore
			if (this._backstep == 0) {
				action.push(NavEditCommands.DISABLE_FORWARD);
			}

			// if reached the second-last entry, we can now go backwards
			if (this._backstep == (this._history.length - 2)) {
				action.push(NavEditCommands.ENABLE_BACK);
			}
			return { 'actions': action, 'address': path };
		} else {
			return { 'actions': action };
		}
	}

	public goBackward(): NavResponse {
		const action = new Array<NavEditCommands>();
		if (this._backstep < this._history.length - 1) {
			const path = this._history[this._backstep + 1];
			this._backstep += 1;

			// if we reached the last entry, we can't go back any more 
			if (this._backstep == (this._history.length - 1)) {
				action.push(NavEditCommands.DISABLE_BACK);
			}
			// if we reached 1, we can now go forwards
			if (this._backstep == 1) {
				action.push(NavEditCommands.ENABLE_FORWARD);
			}
			return { 'actions': action, 'address': path };
		} else {
			return { 'actions': action };
		}
	}

	public addHistory(address: string): NavResponse | undefined {
		const action = new Array<NavEditCommands>();
		if (this._backstep < this._history.length && address == this._history[this._backstep]) {
			return undefined;
		}

		if (this._backstep > 0) {
			this._history = this._history.slice(this._backstep);
		}
		if (this._history.length == 1) {
			action.push(NavEditCommands.ENABLE_BACK);
		}
		this._history.unshift(address);
		this._backstep = 0;
		action.push(NavEditCommands.DISABLE_FORWARD);

		return { 'actions': action };
	}
}