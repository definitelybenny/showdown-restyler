const HEX = /^#[0-9a-f]{6}$/i;

export const THEME_PRESETS = Object.freeze({
	dark: {
		dark: true,
		bg: '#0f1115', panel: '#171a21', panel2: '#1d212a', raised: '#242935',
		border: '#2a3040', text: '#e6e9f0', muted: '#8b93a7', accent: '#7c8cff',
	},
	light: {
		dark: false,
		bg: '#e7e9ef', panel: '#ffffff', panel2: '#f3f4f8', raised: '#e9ebf2',
		border: '#d3d7e2', text: '#1b1f2a', muted: '#5f6779', accent: '#4f5df0',
	},
	midnight: {
		dark: true,
		bg: '#05060d', panel: '#0b0d1a', panel2: '#10132a', raised: '#171b38',
		border: '#1f2447', text: '#dfe4ff', muted: '#7a82b8', accent: '#a78bfa',
	},
});

export const THEME_NAMES = Object.freeze(['auto', ...Object.keys(THEME_PRESETS)]);

/** Black or white, whichever reads better on `hex`. */
export function inkFor(hex) {
	const n = parseInt(hex.slice(1), 16);
	const channel = shift => {
		const c = ((n >> shift) & 255) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
	return luminance > 0.4 ? '#0b0d14' : '#ffffff';
}

/**
 * Resolves theme settings (`preset`, `accent`, `font`) to the token values and the client's dark
 * state. `auto` follows the client: `clientDark` picks the dark or light tokens and `dark` is null
 * (do not touch the client's own preference).
 */
export function resolveTheme({ preset = 'auto', accent = '', font = '' } = {}, clientDark = false) {
	const base = THEME_PRESETS[preset] || THEME_PRESETS[clientDark ? 'dark' : 'light'];
	const chosen = HEX.test(accent) ? accent.toLowerCase() : base.accent;
	return {
		dark: THEME_PRESETS[preset] ? base.dark : null,
		tokens: {
			'--rs-bg': base.bg,
			'--rs-panel': base.panel,
			'--rs-panel-2': base.panel2,
			'--rs-raised': base.raised,
			'--rs-border': base.border,
			'--rs-text': base.text,
			'--rs-muted': base.muted,
			'--rs-accent': chosen,
			'--rs-accent-ink': inkFor(chosen),
			// A font name from the settings box must not be able to break out of the declaration.
			'--rs-font': font.replace(/[^\w\s,'"-]/g, '').trim() || 'system-ui,-apple-system,"Segoe UI",sans-serif',
		},
	};
}

export function tokensCss(tokens, selector = ':root') {
	return `${selector}{${Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(';')}}`;
}
