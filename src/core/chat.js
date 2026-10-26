/**
 * Parses one parsed protocol line (`['c', '~user', 'text']` or `['c:', '1700000000', '~user', 'text']`)
 * into a chat message, or null when it is not chat the Chat panel should show. Messages may
 * contain `|`, so everything after the user is rejoined. Server commands (`/...`) are dropped, except
 * `/me`, which becomes an action line.
 */
export function parseChatLine(args) {
	if (!Array.isArray(args)) return null;
	let time = 0;
	let userArg;
	let rest;
	if (args[0] === 'c:') {
		time = parseInt(args[1], 10) || 0;
		userArg = args[2];
		rest = args.slice(3);
	} else if (args[0] === 'c' || args[0] === 'chat') {
		userArg = args[1];
		rest = args.slice(2);
	} else {
		return null;
	}
	if (typeof userArg !== 'string') return null;
	let text = rest.join('|');
	let action = false;
	if (/^\/me( |$)/.test(text)) {
		action = true;
		text = text.slice(4);
	} else if (text.startsWith('/')) {
		return null;
	}
	if (!text) return null;
	return { time, rank: userArg.charAt(0).trim(), user: userArg.slice(1) || userArg, text, action };
}

/** `HH:MM` for a unix-seconds timestamp, '' when there is none. */
export function formatTime(seconds, date = ts => new Date(ts * 1000)) {
	if (!seconds) return '';
	const d = date(seconds);
	return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Bounded message list with change notification. One per battle room. */
export function createChatLog(limit = 500) {
	const messages = [];
	const listeners = new Set();
	let revision = 0;
	const notify = () => {
		revision++;
		listeners.forEach(fn => fn());
	};
	return {
		/** Changes whenever the message list does, so views can skip redundant redraws. */
		revision: () => revision,
		add(message) {
			messages.push(message);
			if (messages.length > limit) messages.splice(0, messages.length - limit);
			notify();
		},
		/** Adds the chat lines from `battle.stepQueue`-style strings (`'|c|~user|text'`). */
		seed(steps) {
			let added = false;
			for (const step of steps || []) {
				if (typeof step !== 'string' || !step.startsWith('|c')) continue;
				const message = parseChatLine(step.slice(1).split('|'));
				if (!message) continue;
				messages.push(message);
				added = true;
			}
			if (messages.length > limit) messages.splice(0, messages.length - limit);
			if (added) notify();
		},
		messages: () => messages,
		subscribe(fn) {
			listeners.add(fn);
			return () => listeners.delete(fn);
		},
	};
}
