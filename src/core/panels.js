const ID_RE = /^[a-z0-9-]+$/;

export const PANEL_HOSTS = Object.freeze(['dock', 'column', 'side', 'popout']);

/** Bus events that make a mounted panel re-read its room. */
export const PANEL_UPDATE_EVENTS = Object.freeze(['battle:start', 'battle:line', 'room:focus', 'room:close']);

/**
 * Panel registry. A panel is `{ id, title, icon?, hosts?, render(el, ctx) }` where `render` draws into
 * `el` (use `el.ownerDocument`; the element may live in a pop-out window) and may return a cleanup
 * function or `{ destroy }`. `ctx` is `{ getRoom, host, subscribe(fn) }`; `subscribe` fires on room
 * and battle activity and is undone at unmount. Panels survive module toggles: only the registering
 * side unregisters them, and unregistering unmounts every live instance.
 */
export function createPanelRegistry({ bus, host = null, emit = () => {}, onError = err => console.error(err) } = {}) {
	const panels = new Map();
	const mounts = new Map(); // id -> Set<{ unmount }>

	function validate(def) {
		if (!def || typeof def !== 'object') throw new TypeError('registerPanel: definition must be an object');
		if (typeof def.id !== 'string' || !ID_RE.test(def.id)) {
			throw new TypeError('registerPanel: id must match /^[a-z0-9-]+$/');
		}
		if (typeof def.render !== 'function') throw new TypeError('registerPanel: render must be a function');
		const hosts = def.hosts ?? PANEL_HOSTS;
		if (!Array.isArray(hosts) || hosts.some(h => !PANEL_HOSTS.includes(h))) {
			throw new TypeError(`registerPanel: hosts must be a subset of ${PANEL_HOSTS.join(', ')}`);
		}
		return [...hosts];
	}

	function info(entry) {
		return { id: entry.id, title: entry.title, icon: entry.icon, hosts: [...entry.hosts] };
	}

	function register(def) {
		const hosts = validate(def);
		if (panels.has(def.id)) throw new Error(`panel already registered: ${def.id}`);
		const entry = { id: def.id, title: def.title || def.id, icon: def.icon, hosts, render: def.render };
		panels.set(entry.id, entry);
		emit('panel:register', info(entry));
		return function unregister() {
			if (panels.get(entry.id) !== entry) return;
			panels.delete(entry.id);
			for (const mount of [...(mounts.get(entry.id) || [])]) mount.unmount();
			mounts.delete(entry.id);
			emit('panel:unregister', { id: entry.id });
		};
	}

	/** Registered panels, optionally only those allowed in `hostName`. */
	function list(hostName) {
		return [...panels.values()].filter(p => !hostName || p.hosts.includes(hostName)).map(info);
	}

	const has = id => panels.has(id);

	/**
	 * Renders panel `id` into `el`. `context` is `{ getRoom }`. Returns `{ unmount }`, or null when the
	 * panel is unknown or its render threw (the error is reported, never rethrown into the client).
	 */
	function mount(id, el, context = {}) {
		const entry = panels.get(id);
		if (!entry) return null;
		const unsubs = [];
		const ctx = {
			getRoom: () => null,
			host,
			...context,
			subscribe(fn) {
				if (!bus) return () => {};
				const offs = PANEL_UPDATE_EVENTS.map(event => bus.on(event, fn));
				const off = () => offs.forEach(o => o());
				unsubs.push(off);
				return off;
			},
		};
		let cleanup;
		try {
			cleanup = entry.render(el, ctx);
		} catch (err) {
			onError(err);
			unsubs.forEach(off => off());
			return null;
		}
		let done = false;
		const instance = {
			unmount() {
				if (done) return;
				done = true;
				mounts.get(id)?.delete(instance);
				unsubs.forEach(off => off());
				try {
					if (typeof cleanup === 'function') cleanup();
					else if (cleanup && typeof cleanup.destroy === 'function') cleanup.destroy();
				} catch (err) {
					onError(err);
				}
			},
		};
		if (!mounts.has(id)) mounts.set(id, new Set());
		mounts.get(id).add(instance);
		return instance;
	}

	return { register, list, has, mount };
}
