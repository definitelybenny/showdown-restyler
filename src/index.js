// Sandbox side (Tampermonkey). Injects the page-context bundle and bridges
// GM storage, which page context cannot reach: the stored value is embedded in the
// injected script, and the page writes back through a CustomEvent with a string detail.
const STORAGE_KEY = 'restyler:v1';
const SAVE_EVENT = 'restyler:save';

function readStored() {
	try {
		const value = GM_getValue(STORAGE_KEY, null);
		return typeof value === 'string' ? value : null;
	} catch (err) {
		console.warn('[Restyler] GM_getValue failed', err);
		return null;
	}
}

document.addEventListener(SAVE_EVENT, event => {
	if (typeof event.detail !== 'string') return;
	try {
		GM_setValue(STORAGE_KEY, event.detail);
	} catch (err) {
		console.warn('[Restyler] GM_setValue failed', err);
	}
});

const boot = { stored: readStored(), saveEvent: SAVE_EVENT, storageKey: STORAGE_KEY };
const script = document.createElement('script');
script.textContent = `window.__RESTYLER_BOOT__ = ${JSON.stringify(boot)};\n${__PAGE_CODE__}`;
(document.head || document.documentElement).appendChild(script);
script.remove();
