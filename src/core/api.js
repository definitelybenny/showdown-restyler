/** Bumped only on breaking changes to `window.ShowdownRestyler`. */
export const API_VERSION = 1;

/**
 * The object exposed as `window.ShowdownRestyler`. Other userscripts (Mock Regional Helper, ...) use
 * it without depending on our internals. It appears together with the `showdown-restyler:ready`
 * window event, so scripts that load earlier should wait for that event.
 */
export function createApi({ bus, panels, registry }) {
	return Object.freeze({
		version: API_VERSION,
		/** Registers a panel; returns an unregister function. Throws on an invalid definition. */
		registerPanel: def => panels.register(def),
		/** Subscribes to an event bus event; returns an unsubscribe function. */
		on: (event, fn) => bus.on(event, fn),
		/** Read and toggle modules (a disabled settings-ui can be brought back this way). */
		modules: Object.freeze({
			list: () => registry.list(),
			isEnabled: id => registry.isEnabled(id),
			setEnabled: (id, on) => registry.setEnabled(id, !!on),
		}),
	});
}
