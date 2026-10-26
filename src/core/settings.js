import { defaultLayout } from './layout.js';

export const STORE_VERSION = 1;

/**
 * Persisted store shaped `{ version, modules: {id: {enabled, ...settings}}, layout, theme }`.
 * `storage` is `{ load(): string | null, save(string) }`. `migrations[n]` upgrades a state
 * from version n to n + 1.
 */
export function createSettings({ storage, emit = () => {}, migrations = {}, warn = console.warn }) {
	let state = load();

	function fresh() {
		return { version: STORE_VERSION, modules: {}, layout: defaultLayout(), theme: {} };
	}

	function load() {
		let raw = null;
		try {
			raw = storage.load();
		} catch (err) {
			warn('[Restyler] settings load failed', err);
		}
		if (!raw) return fresh();
		try {
			let parsed = JSON.parse(raw);
			while (parsed.version < STORE_VERSION) {
				const step = migrations[parsed.version];
				if (!step) throw new Error(`no migration from version ${parsed.version}`);
				parsed = { ...step(parsed), version: parsed.version + 1 };
			}
			const base = fresh();
			return {
				...base,
				...parsed,
				layout: mergeLayout(base.layout, parsed.layout),
			};
		} catch (err) {
			warn('[Restyler] stored settings unreadable, using defaults', err);
			return fresh();
		}
	}

	function mergeLayout(base, patch) {
		if (!patch) return base;
		return {
			...base,
			...patch,
			battle: { ...base.battle, ...patch.battle },
			side: { ...base.side, ...patch.side },
			presets: { ...base.presets, ...patch.presets },
		};
	}

	function flush() {
		try {
			storage.save(JSON.stringify(state));
		} catch (err) {
			warn('[Restyler] settings save failed', err);
		}
	}

	return {
		get: () => state,
		flush,

		layout: () => state.layout,
		/** Shallow-merges top level plus battle/side/presets. `persist: false` defers saving (drags). */
		setLayout(patch, { persist = true } = {}) {
			state = { ...state, layout: mergeLayout(state.layout, patch) };
			emit('layout:change', state.layout);
			if (persist) flush();
		},

		module: id => state.modules[id] || {},
		setModule(id, patch) {
			state = { ...state, modules: { ...state.modules, [id]: { ...state.modules[id], ...patch } } };
			emit('settings:change', { module: id, ...state.modules[id] });
			flush();
		},
	};
}
