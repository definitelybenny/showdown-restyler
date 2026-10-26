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
			return parse(raw);
		} catch (err) {
			warn('[Restyler] stored settings unreadable, using defaults', err);
			return fresh();
		}
	}

	/** Shared by load and import: validates, migrates and merges onto defaults. Throws on bad input. */
	function parse(raw) {
		let parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error('settings must be a JSON object');
		}
		if (!Number.isInteger(parsed.version) || parsed.version < 1) throw new Error('settings have no valid version');
		if (parsed.version > STORE_VERSION) {
			throw new Error(`settings are from a newer version (${parsed.version}, this script reads up to ${STORE_VERSION})`);
		}
		while (parsed.version < STORE_VERSION) {
			const step = migrations[parsed.version];
			if (!step) throw new Error(`no migration from version ${parsed.version}`);
			parsed = { ...step(parsed), version: parsed.version + 1 };
		}
		const base = fresh();
		const modules = parsed.modules && typeof parsed.modules === 'object' && !Array.isArray(parsed.modules) ?
			parsed.modules : {};
		return {
			...base,
			...parsed,
			modules,
			layout: mergeLayout(base.layout, parsed.layout),
		};
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

		/** Pretty JSON of the whole store, for the export button. */
		exportJson: () => JSON.stringify(state, null, 2),

		/**
		 * Replaces the whole store from exported JSON (same validate/migrate/merge path as load).
		 * Throws and leaves the current state untouched when the text is invalid.
		 */
		importJson(text) {
			const next = parse(text);
			const ids = new Set([...Object.keys(state.modules), ...Object.keys(next.modules)]);
			state = next;
			flush();
			emit('layout:change', state.layout);
			for (const id of ids) emit('settings:change', { module: id, ...state.modules[id] });
		},

		/** Back to defaults; modules fall back to their `enabledByDefault` and default values. */
		reset() {
			const ids = Object.keys(state.modules);
			state = fresh();
			flush();
			emit('layout:change', state.layout);
			for (const id of ids) emit('settings:change', { module: id });
		},

		module: id => state.modules[id] || {},
		setModule(id, patch) {
			state = { ...state, modules: { ...state.modules, [id]: { ...state.modules[id], ...patch } } };
			emit('settings:change', { module: id, ...state.modules[id] });
			flush();
		},
	};
}
