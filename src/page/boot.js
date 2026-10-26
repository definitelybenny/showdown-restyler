import { createBus } from '../core/events.js';
import { createSettings } from '../core/settings.js';
import { createRegistry } from '../core/modules.js';
import { createPreactHost } from '../hosts/preact.js';
import coreLayout from '../modules/core-layout.js';
import battleScale from '../modules/battle-scale.js';

const POLL_MS = 250;
const TIMEOUT_MS = 60000;
const MODULES = [coreLayout, battleScale];

const boot = window.__RESTYLER_BOOT__ || {};
const log = (...args) => console.log('[Restyler]', ...args);

/** 'preact' once PS and its deferred panel classes exist, 'classic' for the old client, else null. */
export function detectClient(win) {
	if (win.PS) {
		const ready = typeof win.PS.join === 'function' && win.PS.roomTypes &&
			win.PSView && typeof win.PSView.posStyle === 'function';
		return ready ? 'preact' : null;
	}
	return win.app && win.app._addRoom && win.app.rooms ? 'classic' : null;
}

/** Settings live in GM storage when the sandbox bridge is present, else in localStorage (dev/no GM). */
function createStorage() {
	const key = boot.storageKey || 'restyler:v1';
	if (boot.saveEvent) {
		return {
			load: () => boot.stored ?? null,
			save: text => document.dispatchEvent(new CustomEvent(boot.saveEvent, { detail: text })),
		};
	}
	return {
		load: () => localStorage.getItem(key),
		save: text => localStorage.setItem(key, text),
	};
}

function start() {
	const bus = createBus(err => console.error('[Restyler] event handler failed', err));
	const settings = createSettings({
		storage: createStorage(),
		emit: (event, payload) => bus.emit(event, payload),
	});
	const host = createPreactHost(window);
	const registry = createRegistry({ host, settings, bus });
	for (const mod of MODULES) registry.register(mod);
	registry.sync();
	log('started', registry.list().filter(id => registry.isEnabled(id)));
}

function waitForClient() {
	if (window.__showdownRestylerStarted) return;
	window.__showdownRestylerStarted = true;
	const began = Date.now();
	const timer = setInterval(() => {
		const client = detectClient(window);
		if (client === 'classic') {
			clearInterval(timer);
			log('classic client detected: the Restyler supports only the new client (/preactalpha). Doing nothing.');
		} else if (client === 'preact') {
			clearInterval(timer);
			try {
				start();
			} catch (err) {
				console.error('[Restyler] failed to start', err);
			}
		} else if (Date.now() - began > TIMEOUT_MS) {
			clearInterval(timer);
			log('no Showdown client found after 60s. Giving up.');
		}
	}, POLL_MS);
}

waitForClient();
