import { createPatcher } from './patch.js';
import { createStyle, addHtmlClass } from './css.js';

/**
 * Module registry. A module is `{ id, name, clients, requires?, defaults, css?, setup(ctx) }`.
 * Everything a module does through `ctx` (patch, on, css, htmlClass, panels.register, onDispose) is
 * tracked and undone automatically when the module is disabled. Optional `schema` gives the settings UI
 * hints per default key (`label`, `help`, `min`, `max`, `step`, `options`).
 */
export function createRegistry({ host, settings, bus, panels = null, panelHosts = null, doc = document, logger = console }) {
	const modules = new Map();
	const active = new Map(); // id -> { dispose }

	const prefixed = id => (...args) => logger.log(`[Restyler:${id}]`, ...args);

	function register(mod) {
		if (modules.has(mod.id)) throw new Error(`module already registered: ${mod.id}`);
		if (mod.clients && !mod.clients.includes(host.kind)) return false;
		modules.set(mod.id, mod);
		return true;
	}

	function isEnabled(id) {
		return active.has(id);
	}

	/** On in the settings and so is everything it requires (a disabled dependency takes its dependents down). */
	function wantedEnabled(mod) {
		const on = settings.module(mod.id).enabled ?? mod.enabledByDefault ?? true;
		return on && (mod.requires || []).every(dep => modules.has(dep) && wantedEnabled(modules.get(dep)));
	}

	function makeCtx(mod, disposers) {
		const patcher = createPatcher();
		const style = createStyle(doc, mod.id);
		disposers.push(patcher.undoAll, () => style.remove());

		const moduleSettings = {
			get: key => settings.module(mod.id)[key] ?? mod.defaults?.[key],
			set: (key, value) => settings.setModule(mod.id, { [key]: value }),
			all: () => ({ ...mod.defaults, ...settings.module(mod.id) }),
		};
		const ctx = {
			host,
			log: prefixed(mod.id),
			settings: moduleSettings,
			layout: {
				get: () => settings.layout(),
				set: (patch, opts) => settings.setLayout(patch, opts),
				flush: () => settings.flush(),
			},
			patch: (obj, key, wrapper) => patcher.patch(obj, key, wrapper),
			emit: (event, payload) => bus.emit(event, payload),
			/** Module management for the settings UI. */
			modules: {
				describe: () => describe(),
				isEnabled: id => isEnabled(id),
				setEnabled: (id, on) => setEnabled(id, on),
				applyAll: () => applyAll(),
			},
			/** The whole settings store (export / import / reset); modules use `ctx.settings` and `ctx.layout`. */
			store: settings,
			on(event, fn) {
				const off = bus.on(event, fn);
				disposers.push(off);
				return off;
			},
			css: text => style.set(text),
			htmlClass(name) {
				const remove = addHtmlClass(doc, name);
				disposers.push(remove);
				return remove;
			},
			onDispose: fn => disposers.push(fn),
			panels: {
				register(def) {
					const off = panels.register(def);
					disposers.push(off);
					return off;
				},
				mount: (...args) => panels.mount(...args),
				list: hostName => panels.list(hostName),
				/** Opens a registered panel in a side room or pop-out ('side' | 'popout'). */
				open: (id, where) => panelHosts?.openPanel(id, where) ?? null,
			},
		};

		if (typeof mod.css === 'function') {
			const apply = () => style.set(mod.css(moduleSettings.all(), ctx));
			apply();
			ctx.on('settings:change', e => e.module === mod.id && apply());
		}
		return ctx;
	}

	function enable(id) {
		const mod = modules.get(id);
		if (!mod) throw new Error(`unknown module: ${id}`);
		if (active.has(id)) return;
		for (const dep of mod.requires || []) {
			if (!modules.has(dep)) throw new Error(`${id} requires missing module ${dep}`);
			enable(dep);
		}
		const disposers = [];
		try {
			mod.setup(makeCtx(mod, disposers));
		} catch (err) {
			runDisposers(disposers);
			throw err;
		}
		active.set(id, { dispose: () => runDisposers(disposers) });
		bus.emit('module:enable', id);
	}

	function runDisposers(disposers) {
		while (disposers.length) {
			try {
				disposers.pop()();
			} catch (err) {
				logger.error('[Restyler] dispose failed', err);
			}
		}
	}

	function disable(id) {
		if (!active.has(id)) return;
		for (const [otherId, other] of modules) {
			if (active.has(otherId) && other.requires?.includes(id)) disable(otherId);
		}
		active.get(id).dispose();
		active.delete(id);
		bus.emit('module:disable', id);
	}

	/**
	 * Brings the running modules in line with the settings: enables the wanted ones and disables the
	 * rest. One failing module does not stop the others.
	 */
	function applyAll() {
		for (const mod of modules.values()) {
			if (wantedEnabled(mod)) continue;
			disable(mod.id);
		}
		for (const mod of modules.values()) {
			if (!wantedEnabled(mod)) continue;
			try {
				enable(mod.id);
			} catch (err) {
				logger.error(`[Restyler:${mod.id}] setup failed`, err);
			}
		}
		host.requestLayout();
	}

	function setEnabled(id, on) {
		const mod = modules.get(id);
		if (!mod) throw new Error(`unknown module: ${id}`);
		// Turning a module on turns its requirements on too, so the choice survives a reload.
		if (on) for (const dep of mod.requires || []) settings.setModule(dep, { enabled: true });
		settings.setModule(id, { enabled: on });
		applyAll();
	}

	/** Metadata the settings UI renders from. */
	function describe() {
		return [...modules.values()].map(mod => ({
			id: mod.id,
			name: mod.name || mod.id,
			defaults: mod.defaults || {},
			schema: mod.schema || {},
		}));
	}

	return { register, enable, disable, isEnabled, applyAll, setEnabled, describe, list: () => [...modules.keys()] };
}
