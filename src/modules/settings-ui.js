import { CLIENT, PRESETS, presetLayout } from '../core/layout.js';
import { describeControls, coerceValue } from '../core/schema.js';
import { API_VERSION } from '../core/api.js';

const SELF = 'settings-ui';

function h(doc, tag, props = {}, ...children) {
	const el = doc.createElement(tag);
	for (const [key, value] of Object.entries(props)) {
		if (value == null || value === false) continue;
		if (key === 'class') el.className = value;
		else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
		else if (key in el && key !== 'list') el[key] = value;
		else el.setAttribute(key, value);
	}
	el.append(...children.flat(Infinity).filter(c => c != null && c !== false));
	return el;
}

/**
 * Topbar gear and settings drawer (see docs/mockup.html). Module sections are rendered from each
 * module's `defaults` (plus optional `schema` hints); the Layout section is built by hand because those
 * values live in `layout`, not in module settings. Also JSON import / export of the whole store.
 * The gear is our own fixed element, not a child of the client's header, which Preact replaces wholesale.
 */
export default {
	id: SELF,
	name: 'Settings drawer',
	clients: ['preact'],
	defaults: {},

	css: () => `
.restyler-gear{position:fixed;z-index:1001;width:30px;height:30px;border:1px solid var(--rs-border,#2a3040);border-radius:6px;background:var(--rs-panel,#171a21);color:var(--rs-muted,#8b93a7);font-size:17px;line-height:1;cursor:pointer;padding:0}
.restyler-gear:hover,.restyler-gear.restyler-on{background:var(--rs-accent,#7c8cff);color:var(--rs-accent-ink,#0b0d14)}
.restyler-drawer{position:fixed;z-index:1002;top:${CLIENT.topbar}px;right:0;bottom:0;width:340px;box-sizing:border-box;display:flex;flex-direction:column;background:var(--rs-panel,#171a21);color:var(--rs-text,#e6e9f0);border-left:1px solid var(--rs-border,#2a3040);box-shadow:-12px 0 32px rgba(0,0,0,.4);font:12px/1.4 var(--rs-font,system-ui,sans-serif);transform:translateX(105%);transition:transform .2s ease}
.restyler-drawer.restyler-open{transform:none}
.restyler-drawer header{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--rs-border,#2a3040)}
.restyler-drawer header h1{flex:1;margin:0;font-size:14px;font-weight:600}
.restyler-drawer header small{color:var(--rs-muted,#8b93a7)}
.restyler-drawer .restyler-body{flex:1;overflow:auto;padding:4px 14px 16px;scrollbar-width:thin}
.restyler-drawer h3{margin:16px 0 8px;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--rs-muted,#8b93a7)}
.restyler-drawer button,.restyler-drawer select,.restyler-drawer input,.restyler-drawer textarea{font:inherit;color:inherit}
.restyler-drawer .restyler-btn{padding:4px 10px;border-radius:5px;border:1px solid var(--rs-border,#2a3040);background:var(--rs-panel-2,#1d212a);cursor:pointer}
.restyler-drawer .restyler-btn:hover{background:var(--rs-raised,#242935)}
.restyler-drawer .restyler-btn.restyler-on{background:var(--rs-accent,#7c8cff);border-color:var(--rs-accent,#7c8cff);color:var(--rs-accent-ink,#0b0d14);font-weight:600}
.restyler-drawer .restyler-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0}
.restyler-drawer .restyler-row small{display:block;color:var(--rs-muted,#8b93a7);font-size:11px}
.restyler-drawer .restyler-presets{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.restyler-drawer input[type=text],.restyler-drawer input[type=number],.restyler-drawer select,.restyler-drawer textarea{background:var(--rs-bg,#0f1115);border:1px solid var(--rs-border,#2a3040);border-radius:5px;padding:3px 6px;max-width:150px}
.restyler-drawer textarea{width:100%;max-width:none;box-sizing:border-box;height:120px;font-family:monospace;font-size:11px}
.restyler-drawer input[type=range]{accent-color:var(--rs-accent,#7c8cff);max-width:110px}
.restyler-drawer details{border-bottom:1px solid var(--rs-border,#2a3040)}
.restyler-drawer summary{cursor:pointer;padding:5px 0}
.restyler-drawer .restyler-status{min-height:1.4em;color:var(--rs-muted,#8b93a7)}
.restyler-drawer .restyler-status.restyler-error{color:var(--rs-bad,#f87171)}
`,

	setup(ctx) {
		const { host, store } = ctx;
		const doc = document;
		let open = false;
		let status = { text: '', error: false };
		let exported = '';
		const expandedModules = new Set();

		const gear = h(doc, 'button', {
			class: 'restyler-gear',
			type: 'button',
			title: 'Restyler settings',
			'aria-label': 'Restyler settings',
			onclick: () => setOpen(!open),
		}, '⚙');
		const drawer = h(doc, 'aside', { class: 'restyler-drawer', 'aria-label': 'Restyler settings' });

		const layoutPatch = patch => {
			ctx.layout.set({ ...patch, presets: { active: null } });
			host.requestLayout();
		};

		function control(c, value, onCommit) {
			const label = h(doc, 'div', {}, c.label, c.help ? h(doc, 'small', {}, c.help) : null);
			let input;
			if (c.type === 'toggle') {
				input = h(doc, 'input', { type: 'checkbox', checked: !!value, onchange: e => onCommit(e.target.checked) });
			} else if (c.type === 'select') {
				input = h(doc, 'select', { onchange: e => onCommit(e.target.value) },
					c.options.map(o => h(doc, 'option', { value: String(o.value), selected: String(o.value) === String(value) }, o.label)));
			} else if (c.type === 'number') {
				input = h(doc, 'input', {
					type: 'number', value: String(value), min: c.min ?? undefined, max: c.max ?? undefined,
					step: c.step ?? undefined, onchange: e => onCommit(e.target.value),
				});
			} else if (c.type === 'color') {
				input = h(doc, 'input', { type: 'color', value: String(value), onchange: e => onCommit(e.target.value) });
			} else {
				input = h(doc, 'input', { type: 'text', value: String(value ?? ''), onchange: e => onCommit(e.target.value) });
			}
			return h(doc, 'label', { class: 'restyler-row' }, label, input);
		}

		function moduleControls(info) {
			const settings = { ...info.defaults, ...store.get().modules[info.id] };
			return describeControls(info.defaults, info.schema).map(c => control(c, settings[c.key], raw => {
				const result = coerceValue(c, raw);
				if (!result.ok) return render();
				store.setModule(info.id, { [c.key]: result.value });
				host.requestLayout();
			}));
		}

		function layoutSection() {
			const layout = store.layout();
			const manual = typeof layout.battle.fieldScale === 'number';
			return [
				h(doc, 'h3', {}, 'Layout preset'),
				h(doc, 'div', { class: 'restyler-presets' }, Object.keys(PRESETS).map(name =>
					h(doc, 'button', {
						type: 'button',
						class: `restyler-btn${layout.presets.active === name ? ' restyler-on' : ''}`,
						onclick: () => {
							ctx.layout.set(presetLayout(name));
							host.requestLayout();
						},
					}, name.charAt(0).toUpperCase() + name.slice(1)))),
				h(doc, 'h3', {}, 'Battle field'),
				control({ type: 'select', label: 'Field scale', options: [{ value: 'fit', label: 'Auto fit' }, { value: 'manual', label: 'Manual' }] },
					manual ? 'manual' : 'fit', v => layoutPatch({ battle: { fieldScale: v === 'manual' ? (typeof layout.battle.fieldScale === 'number' ? layout.battle.fieldScale : 1.5) : 'fit' } })),
				manual && control({ type: 'number', label: 'Manual scale', min: 1, max: 4, step: 0.1 }, layout.battle.fieldScale, v => {
					const r = coerceValue({ type: 'number', min: 1, max: 4 }, v);
					if (r.ok) layoutPatch({ battle: { fieldScale: r.value } });
				}),
				control({ type: 'number', label: 'Largest scale', help: 'Cap for auto fit.', min: 1, max: 4, step: 0.1 }, layout.battle.maxScale, v => {
					const r = coerceValue({ type: 'number', min: 1, max: 4 }, v);
					if (r.ok) layoutPatch({ battle: { maxScale: r.value } });
				}),
				control({ type: 'number', label: 'Log width (px)', help: 'Kept free beside the field.', min: CLIENT.logReserve, max: 800, step: 10 }, layout.battle.logMin, v => {
					const r = coerceValue({ type: 'number', min: CLIENT.logReserve, max: 800 }, v);
					if (r.ok) layoutPatch({ battle: { logMin: r.value } });
				}),
				h(doc, 'h3', {}, 'Side tabs'),
				control({ type: 'number', label: 'Tabs shown at once', help: 'Needs the Multiple side tabs module.', min: 1, max: 4, step: 1 }, layout.side.pinned, v => {
					const r = coerceValue({ type: 'number', min: 1, max: CLIENT.maxPinned }, v);
					if (r.ok) layoutPatch({ side: { pinned: Math.round(r.value), sizes: null } });
				}),
				control({ type: 'select', label: 'Arrangement', options: [{ value: 'vertical', label: 'Stacked' }, { value: 'horizontal', label: 'Columns' }] },
					layout.side.split, v => layoutPatch({ side: { split: v === 'horizontal' ? 'horizontal' : 'vertical' } })),
				h(doc, 'div', { class: 'restyler-row' }, 'Left panel width',
					h(doc, 'button', { type: 'button', class: 'restyler-btn', onclick: () => layoutPatch({ leftWidth: null }) }, 'Reset')),
			];
		}

		function modulesSection() {
			const infos = ctx.modules.describe().filter(m => m.id !== SELF);
			return [
				h(doc, 'h3', {}, 'Modules'),
				infos.map(info => {
					const enabled = ctx.modules.isEnabled(info.id);
					const controls = enabled ? moduleControls(info) : [];
					const toggle = h(doc, 'input', {
						type: 'checkbox', checked: enabled,
						onchange: e => ctx.modules.setEnabled(info.id, e.target.checked),
					});
					const head = h(doc, 'label', { class: 'restyler-row' }, info.name, toggle);
					if (!controls.length) return head;
					return [head, h(doc, 'details', {
						open: expandedModules.has(info.id),
						ontoggle: e => (e.target.open ? expandedModules.add(info.id) : expandedModules.delete(info.id)),
					}, h(doc, 'summary', {}, `${info.name} options`), controls)];
				}),
			];
		}

		function setStatus(text, error = false) {
			status = { text, error };
			render();
		}

		function dataSection() {
			const area = h(doc, 'textarea', { placeholder: 'Exported settings appear here. Paste settings here to import.', value: exported, oninput: e => { exported = e.target.value; } });
			return [
				h(doc, 'h3', {}, 'Export and import'),
				h(doc, 'div', { class: 'restyler-row' },
					h(doc, 'button', {
						type: 'button', class: 'restyler-btn',
						onclick: async () => {
							exported = store.exportJson();
							try {
								await navigator.clipboard.writeText(exported);
								setStatus('Exported and copied to the clipboard.');
							} catch {
								setStatus('Exported. Copy the text below.');
							}
						},
					}, 'Export'),
					h(doc, 'button', {
						type: 'button', class: 'restyler-btn',
						onclick: () => {
							try {
								store.importJson(exported);
								ctx.modules.applyAll();
								setStatus('Imported.');
							} catch (err) {
								setStatus(`Import failed: ${err.message}`, true);
							}
						},
					}, 'Import'),
					h(doc, 'button', {
						type: 'button', class: 'restyler-btn',
						onclick: () => {
							if (!doc.defaultView.confirm('Reset every Restyler setting to its default?')) return;
							store.reset();
							exported = '';
							ctx.modules.applyAll();
							setStatus('Reset to defaults.');
						},
					}, 'Reset all')),
				area,
				h(doc, 'div', { class: `restyler-status${status.error ? ' restyler-error' : ''}`, role: 'status' }, status.text),
			];
		}

		function render() {
			const body = h(doc, 'div', { class: 'restyler-body' }, layoutSection(), modulesSection(), dataSection());
			const keep = drawer.querySelector('.restyler-body');
			const scroll = keep ? keep.scrollTop : 0;
			drawer.replaceChildren(
				h(doc, 'header', {}, h(doc, 'h1', {}, 'Restyler settings'), h(doc, 'small', {}, `API v${API_VERSION}`),
					h(doc, 'button', { type: 'button', class: 'restyler-btn', 'aria-label': 'Close', onclick: () => setOpen(false) }, '×')),
				body
			);
			body.scrollTop = scroll;
		}

		function setOpen(next) {
			open = next;
			drawer.classList.toggle('restyler-open', open);
			gear.classList.toggle('restyler-on', open);
			if (open) render();
		}

		/** Left of the client's own user bar when there is one, else the top right corner. */
		function placeGear() {
			if (!gear.isConnected) doc.body.appendChild(gear);
			if (!drawer.isConnected) doc.body.appendChild(drawer);
			const bar = doc.querySelector('#header .userbar');
			const rect = bar && bar.getBoundingClientRect();
			gear.style.top = `${rect && rect.height ? Math.max(0, rect.top + (rect.height - 30) / 2) : 6}px`;
			gear.style.right = `${rect && rect.width ? Math.max(6, doc.documentElement.clientWidth - rect.left + 6) : 6}px`;
		}

		const onKey = event => {
			if (event.key === 'Escape' && open) setOpen(false);
		};
		doc.addEventListener('keydown', onKey);

		const refresh = () => open && render();
		for (const event of ['module:enable', 'module:disable']) ctx.on(event, refresh);
		let redrawPending = false;
		ctx.on('layout:change', () => {
			if (!open || redrawPending) return;
			redrawPending = true;
			requestAnimationFrame(() => {
				redrawPending = false;
				if (open) render();
			});
		});
		ctx.onDispose(host.subscribe(placeGear));
		window.addEventListener('resize', placeGear);
		ctx.onDispose(() => {
			doc.removeEventListener('keydown', onKey);
			window.removeEventListener('resize', placeGear);
			gear.remove();
			drawer.remove();
		});
		placeGear();
	},
};
