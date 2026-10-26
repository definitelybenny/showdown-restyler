/** Minimal event bus. `on` returns an unsubscribe function. */
export function createBus(onError = err => console.error(err)) {
	const handlers = new Map();

	function on(event, fn) {
		let set = handlers.get(event);
		if (!set) handlers.set(event, (set = new Set()));
		set.add(fn);
		return () => set.delete(fn);
	}

	function emit(event, payload) {
		for (const fn of [...(handlers.get(event) || [])]) {
			try {
				fn(payload);
			} catch (err) {
				onError(err);
			}
		}
	}

	return { on, emit };
}
