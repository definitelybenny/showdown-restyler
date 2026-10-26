/**
 * Chained, reversible monkey-patching. Always wraps whatever is installed right now
 * (Showdex may have wrapped it first) and never reassigns blindly.
 *
 * wrapper is called as `wrapper.call(this, prev, ...args)`.
 * If something else wrapped on top of us, undo cannot unlink safely, so the wrapper
 * is switched to pass-through instead of clobbering the later wrapper.
 */
export function createPatcher() {
	const undos = [];

	function patch(obj, key, wrapper) {
		const prev = obj[key];
		if (typeof prev !== 'function') throw new TypeError(`patch: ${String(key)} is not a function`);
		const hadOwn = Object.prototype.hasOwnProperty.call(obj, key);
		let active = true;
		const installed = function (...args) {
			if (!active) return prev.apply(this, args);
			return wrapper.call(this, prev, ...args);
		};
		obj[key] = installed;

		const undo = () => {
			if (!active) return;
			active = false;
			if (obj[key] !== installed) return;
			if (hadOwn) obj[key] = prev;
			else delete obj[key];
		};
		undos.push(undo);
		return undo;
	}

	function undoAll() {
		while (undos.length) undos.pop()();
	}

	return { patch, undoAll };
}
