const HEX = /^#[0-9a-f]{6}$/i;

function humanize(key) {
	const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function normalizeOptions(options) {
	return options.map(o => (typeof o === 'object' && o !== null ? { value: o.value, label: o.label ?? String(o.value) } : { value: o, label: String(o) }));
}

/**
 * Settings-UI control descriptors from a module's `defaults` (types come from the default values) plus
 * an optional per-key `schema`: `{ label, help, min, max, step, options, color }`. `enabled` is
 * reserved for the module toggle and skipped.
 */
export function describeControls(defaults, schema = {}) {
	const controls = [];
	for (const key of Object.keys(defaults)) {
		if (key === 'enabled') continue;
		const value = defaults[key];
		const meta = schema[key] || {};
		let type;
		if (meta.options) type = 'select';
		else if (typeof value === 'boolean') type = 'toggle';
		else if (typeof value === 'number') type = 'number';
		else if (meta.color || (typeof value === 'string' && HEX.test(value))) type = 'color';
		else if (typeof value === 'string') type = 'text';
		else continue; // objects and arrays have no generic control
		const control = { key, type, label: meta.label || humanize(key), help: meta.help || '' };
		if (type === 'number') {
			control.min = meta.min ?? null;
			control.max = meta.max ?? null;
			control.step = meta.step ?? null;
		}
		if (type === 'select') control.options = normalizeOptions(meta.options);
		controls.push(control);
	}
	return controls;
}

/** Turns raw UI input into a setting value. Returns `{ ok: true, value }` or `{ ok: false }`. */
export function coerceValue(control, raw) {
	switch (control.type) {
	case 'toggle':
		return { ok: true, value: raw === true || raw === 'true' };
	case 'number': {
		if (raw === '' || raw === null) return { ok: false };
		let n = Number(raw);
		if (!Number.isFinite(n)) return { ok: false };
		if (control.min != null) n = Math.max(control.min, n);
		if (control.max != null) n = Math.min(control.max, n);
		return { ok: true, value: n };
	}
	case 'select': {
		const match = control.options.find(o => String(o.value) === String(raw));
		return match ? { ok: true, value: match.value } : { ok: false };
	}
	case 'color':
		return HEX.test(String(raw)) ? { ok: true, value: String(raw).toLowerCase() } : { ok: false };
	default:
		return { ok: true, value: String(raw) };
	}
}
