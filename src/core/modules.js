import { createPatcher } from './patch.js';
import { createStyle, addHtmlClass } from './css.js';

/**
 * Module registry. A module is `{ id, name, clients, requires?, defaults, css?, setup(ctx) }`.
 * Everything a module does through `ctx` (patch, on, css, htmlClass, onDispose) is tracked and
 * undone automatically when the module is disabled.
 */
export function createRegistry({ host, settings, bus, doc = document, logger = console }) {
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

	function wantedEnabled(mod) {
		return settings.module(mod.id).enabled ?? mod.enabledByDefault ?? true;
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

	/** Enables every registered module the settings want on; one failing module does not stop the rest. */
	function sync() {
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
		settings.setModule(id, { enabled: on });
		if (on) enable(id);
		else disable(id);
		host.requestLayout();
	}

	return { register, enable, disable, isEnabled, sync, setEnabled, list: () => [...modules.keys()] };
}
