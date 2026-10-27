import { dockRect } from '../core/layout.js';
import { createRoomAttachments, autoSync } from '../core/attach.js';

const HEADER_HEIGHT = 28;

/** The panel to show: the saved choice if it still exists, else the first available. */
export function resolveActive(ids, preferred) {
	if (ids.includes(preferred)) return preferred;
	return ids[0] ?? null;
}

function button(doc, className, label, title, onClick) {
	const b = doc.createElement('button');
	b.type = 'button';
	b.className = className;
	b.textContent = label;
	b.title = title;
	b.addEventListener('click', onClick);
	return b;
}

/**
 * A dock under the battle controls: our own element inside the battle room (Preact leaves it alone),
 * positioned from the live `.battle-controls` rect. It hosts any registered panel allowed in the
 * `dock` host as tabs, and can pop the active panel out to a side room or window.
 */
export default {
	id: 'battle-dock',
	name: 'Battle dock',
	clients: ['preact'],
	requires: ['battle-scale'],
	defaults: { active: 'ots', collapsed: false, minHeight: 80, height: 0 },
	schema: {
		height: { label: 'Dock height (px)', help: '0 = fill the space under the controls. Drag the dock top edge to resize.', min: 0, max: 800, step: 10 },
		active: { label: 'Panel shown first', help: 'Panel id, for example ots or chat.' },
		collapsed: { label: 'Collapsed' },
		minHeight: { label: 'Hide when shorter than (px)', min: 40, max: 400, step: 10 },
	},

	css: () => `
.restyler-dock{position:absolute;z-index:5;display:flex;flex-direction:column;box-sizing:border-box;background:var(--rs-panel,#171a21);color:var(--rs-text,#e6e9f0);border:1px solid var(--rs-border,#2a3040);border-radius:var(--rs-radius,6px);overflow:visible;font:12px/1.4 var(--rs-font,system-ui,sans-serif)}
.restyler-dock-head{flex:none;height:${HEADER_HEIGHT}px;display:flex;align-items:center;gap:4px;padding:0 4px 0 8px;background:var(--rs-panel-2,#1d212a);border-bottom:1px solid var(--rs-border,#2a3040)}
.restyler-dock-tabs{flex:1;display:flex;gap:4px;min-width:0;overflow:hidden}
.restyler-dock-tab{padding:2px 9px;border-radius:99px;border:1px solid var(--rs-border,#2a3040);background:none;color:var(--rs-muted,#8b93a7);font:inherit;font-size:11px;cursor:pointer;white-space:nowrap}
.restyler-dock-tab:hover{color:var(--rs-text,#e6e9f0)}
.restyler-dock-tab.restyler-on{background:var(--rs-accent,#7c8cff);border-color:var(--rs-accent,#7c8cff);color:var(--rs-accent-ink,#0b0d14);font-weight:600}
.restyler-dock-btn{width:22px;height:22px;border:0;border-radius:4px;background:none;color:var(--rs-muted,#8b93a7);font:inherit;cursor:pointer}
.restyler-dock-btn:hover{background:var(--rs-raised,#242935);color:var(--rs-text,#e6e9f0)}
.restyler-dock-grip{position:absolute;top:-3px;left:0;right:0;height:8px;cursor:ns-resize;z-index:1;touch-action:none}
.restyler-dock-body{flex:1;min-height:0;overflow:auto;scrollbar-width:thin}
`,

	setup(ctx) {
		let generation = 0;

		const attachments = createRoomAttachments({
			host: ctx.host,
			create(room, roomEl) {
				const doc = roomEl.ownerDocument;
				const root = doc.createElement('div');
				root.className = 'restyler-dock';
				const head = doc.createElement('div');
				head.className = 'restyler-dock-head';
				const tabs = doc.createElement('div');
				tabs.className = 'restyler-dock-tabs';
				const body = doc.createElement('div');
				body.className = 'restyler-dock-body';
				const entry = { root, head, tabs, body, room, mount: null, mountedId: null, generation: -1, tabsKey: '' };
				const openActive = where => () => entry.mountedId && ctx.panels.open(entry.mountedId, where);
				head.append(
					tabs,
					button(doc, 'restyler-dock-btn', '▤', 'Open in a side tab', openActive('side')),
					button(doc, 'restyler-dock-btn', '↗', 'Pop out', openActive('popout')),
					button(doc, 'restyler-dock-btn', '–', 'Collapse', () => ctx.settings.set('collapsed', !ctx.settings.get('collapsed')))
				);
				const grip = doc.createElement('div');
				grip.className = 'restyler-dock-grip';
				grip.title = 'Drag to resize';
				grip.addEventListener('pointerdown', down => {
					down.preventDefault();
					grip.setPointerCapture(down.pointerId);
					const move = e => {
						const bottom = root.parentElement.getBoundingClientRect().bottom;
						ctx.settings.set('height', Math.max(HEADER_HEIGHT + 20, Math.round(bottom - e.clientY)));
					};
					const up = () => {
						grip.removeEventListener('pointermove', move);
						grip.removeEventListener('pointerup', up);
					};
					grip.addEventListener('pointermove', move);
					grip.addEventListener('pointerup', up);
				});
				root.append(grip, head, body);
				return entry;
			},
			update(entry, room, roomEl) {
				const controls = roomEl.querySelector('.battle-controls-container .battle-controls') ||
					roomEl.querySelector('.battle-controls');
				const ids = ctx.panels.list('dock').map(p => p.id);
				const active = resolveActive(ids, ctx.settings.get('active'));
				const collapsed = !!ctx.settings.get('collapsed');

				const roomBox = roomEl.getBoundingClientRect();
				const box = controls ? controls.getBoundingClientRect() : null;
				// Move and switch menus can overflow the controls box; never cover any visible descendant.
				let bottom = box ? box.bottom : 0;
				if (controls) {
					for (const el of controls.querySelectorAll('*')) {
						const r = el.getBoundingClientRect();
						if (r.width > 0 && r.height > 0 && r.bottom > bottom) bottom = r.bottom;
					}
				}
				const rect = box && dockRect(
					{ top: box.top - roomBox.top, left: box.left - roomBox.left, width: box.width, height: bottom - box.top },
					{ top: 0, left: 0, width: roomEl.clientWidth, height: roomEl.clientHeight },
					{ minHeight: ctx.settings.get('minHeight'), maxHeight: ctx.settings.get('height') }
				);
				if (!rect || !active) {
					entry.root.style.display = 'none';
					return;
				}
				Object.assign(entry.root.style, {
					display: 'flex',
					top: `${rect.top}px`,
					left: `${rect.left}px`,
					width: `${rect.width}px`,
					height: collapsed ? `${HEADER_HEIGHT}px` : `${rect.height}px`,
				});
				entry.body.style.display = collapsed ? 'none' : '';

				const tabsKey = `${active}|${ctx.panels.list('dock').map(p => `${p.id}:${p.title}`).join(',')}`;
				if (tabsKey !== entry.tabsKey) {
					entry.tabsKey = tabsKey;
					const doc = roomEl.ownerDocument;
					entry.tabs.replaceChildren(...ctx.panels.list('dock').map(p => {
						const tab = button(doc, `restyler-dock-tab${p.id === active ? ' restyler-on' : ''}`, p.title, p.title,
							() => ctx.settings.set('active', p.id));
						return tab;
					}));
				}

				if (entry.mountedId !== active || entry.generation !== generation) {
					entry.mount?.unmount();
					entry.body.replaceChildren();
					entry.mount = ctx.panels.mount(active, entry.body, { getRoom: () => room });
					entry.mountedId = active;
					entry.generation = generation;
				}
			},
			destroy(entry) {
				entry.mount?.unmount();
				entry.root.remove();
			},
		});

		const schedule = autoSync(ctx, attachments);
		const bump = () => {
			generation++;
			schedule();
		};
		ctx.on('panel:register', bump);
		ctx.on('panel:unregister', bump);
		ctx.on('settings:change', e => e.module === 'battle-dock' && schedule());
	},
};
