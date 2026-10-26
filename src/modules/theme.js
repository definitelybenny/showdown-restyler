import { THEME_NAMES, resolveTheme, tokensCss } from '../core/theme.js';

/** Conservative recolouring of the client chrome: only colours, never layout, and the custom background image stays. */
const CLIENT_SKIN = `
html.restyler-themed body{background-color:var(--rs-bg)!important;font-family:var(--rs-font)}
html.restyler-themed #header{background-color:var(--rs-panel)!important;border-color:var(--rs-border)!important}
html.restyler-themed .ps-room-opaque{background-color:var(--rs-panel)!important}
`;

/**
 * Token layer (`--rs-*` custom properties on `<html>`) used by our own panels and, optionally, a light
 * recolour of the client. The preset also drives the client's own dark/light preference (`PS.prefs.theme`)
 * so Showdex and the stock styles follow; the previous preference is restored on disable. `auto` leaves
 * the client's preference alone and just follows it.
 */
export default {
	id: 'theme',
	name: 'Theme',
	clients: ['preact'],
	defaults: { preset: 'auto', customAccent: false, accent: '#7c8cff', font: '', skinClient: true },
	schema: {
		preset: { label: 'Theme', help: 'Auto follows the client. Dark, Light and Midnight also set the client theme.', options: THEME_NAMES },
		customAccent: { label: 'Use custom accent' },
		accent: { label: 'Accent colour', color: true },
		font: { label: 'Font family', help: 'CSS font-family, for example Inter, sans-serif. Empty = system font.' },
		skinClient: { label: 'Recolour the client', help: 'Background and top bar colours; the battle field is untouched.' },
	},

	setup(ctx) {
		const { host } = ctx;
		const doc = document;
		const html = doc.documentElement;
		let previousPref = null;
		let ourPref = null;
		let addedDark = false;
		let lastCss = null;

		function driveClient(dark) {
			if (dark === null) {
				restorePref();
				return;
			}
			const desired = dark ? 'dark' : 'light';
			if (host.theme.get() === desired) return;
			if (ourPref === null) previousPref = host.theme.get();
			ourPref = desired;
			host.theme.set(desired);
		}

		function restorePref() {
			if (ourPref !== null && host.theme.get() === ourPref && previousPref != null) host.theme.set(previousPref);
			ourPref = null;
			previousPref = null;
		}

		function setDarkClass(dark) {
			if (dark && !html.classList.contains('dark')) {
				html.classList.add('dark');
				addedDark = true;
			} else if (!dark && addedDark) {
				html.classList.remove('dark');
				addedDark = false;
			}
		}

		function apply() {
			const s = ctx.settings.all();
			const resolved = resolveTheme(
				{ preset: s.preset, accent: s.customAccent ? s.accent : '', font: s.font },
				host.theme.isDark()
			);
			const css = tokensCss(resolved.tokens) + (s.skinClient ? CLIENT_SKIN : '');
			if (css !== lastCss) {
				lastCss = css;
				ctx.css(css);
				ctx.emit('theme:change', { preset: s.preset, dark: resolved.dark, tokens: resolved.tokens });
			}
			driveClient(resolved.dark);
			setDarkClass(resolved.dark === true);
		}

		ctx.htmlClass('restyler-themed');
		ctx.on('settings:change', e => e.module === 'theme' && apply());
		// Disposers run last-in first-out: unsubscribe before restoring, or the restore would re-trigger apply().
		ctx.onDispose(() => {
			restorePref();
			setDarkClass(false);
		});
		ctx.onDispose(host.theme.subscribe(apply));
		apply();
	},
};
