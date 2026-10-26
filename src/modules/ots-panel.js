import { teamSheets } from '../core/ots.js';

function text(doc, tag, className, value) {
	const el = doc.createElement(tag);
	if (className) el.className = className;
	el.textContent = value;
	return el;
}

function monCard(doc, mon) {
	const card = doc.createElement('div');
	card.className = 'restyler-ots-card';
	const head = text(doc, 'div', 'restyler-ots-name', mon.species);
	const extra = [mon.level ? `L${mon.level}` : '', mon.gender].filter(Boolean).join(' ');
	if (extra) head.appendChild(text(doc, 'small', '', ` ${extra}`));
	card.appendChild(head);
	const meta = [mon.item, mon.ability, mon.teraType && `Tera ${mon.teraType}`, mon.nature].filter(Boolean).join(' · ');
	if (meta) card.appendChild(text(doc, 'div', 'restyler-ots-meta', meta));
	const moves = doc.createElement('ul');
	for (const move of mon.moves) moves.appendChild(text(doc, 'li', '', move));
	card.appendChild(moves);
	return card;
}

function renderSheets(doc, root, sheets) {
	if (!sheets.length) {
		root.replaceChildren(text(doc, 'div', 'restyler-ots-empty', 'No open team sheet in this battle.'));
		return;
	}
	root.replaceChildren(...sheets.map(sheet => {
		const section = doc.createElement('section');
		section.className = 'restyler-ots-side';
		section.appendChild(text(doc, 'h4', '', sheet.name));
		const grid = doc.createElement('div');
		grid.className = 'restyler-ots-grid';
		grid.append(...sheet.mons.map(mon => monCard(doc, mon)));
		section.appendChild(grid);
		return section;
	}));
}

/**
 * Open team sheet as cards, built from `battle.sides[n].pokemon` (filled by `|showteam|`). Registers
 * the `ots` panel for the dock, a side room or a pop-out, and (option) hides the client's native
 * team-sheet `<details>` in the log while it is active.
 */
export default {
	id: 'ots-panel',
	name: 'Open team sheet',
	clients: ['preact'],
	defaults: { hideNative: true },
	schema: {
		hideNative: { label: 'Hide the team sheet in the log', help: 'The panel replaces the collapsed sheet in the battle log.' },
	},

	css: settings => `${settings.hideNative ? `
.battle-log .infobox:has(> details.details){display:none!important}
.battle-log .infobox > details.details{display:none!important}` : ''}
.restyler-ots{padding:8px 10px;color:var(--rs-text,#e6e9f0);font:12px/1.4 var(--rs-font,system-ui,sans-serif)}
.restyler-ots h4{margin:6px 0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--rs-muted,#8b93a7)}
.restyler-ots-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.restyler-ots-card{background:var(--rs-panel-2,#1d212a);border:1px solid var(--rs-border,#2a3040);border-radius:6px;padding:8px;min-width:0}
.restyler-ots-name{font-weight:600}
.restyler-ots-name small{color:var(--rs-muted,#8b93a7);font-weight:400}
.restyler-ots-meta{color:var(--rs-muted,#8b93a7);font-size:11px}
.restyler-ots-card ul{list-style:none;margin:4px 0 0;padding:0;display:grid;gap:2px}
.restyler-ots-card li{font-size:11px;padding:1px 6px;background:var(--rs-bg,#0f1115);border-radius:3px;border-left:2px solid var(--rs-accent,#7c8cff);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.restyler-ots-empty{color:var(--rs-muted,#8b93a7);padding:8px 0}
`,

	setup(ctx) {
		ctx.panels.register({
			id: 'ots',
			title: 'Team sheet',
			hosts: ['dock', 'column', 'side', 'popout'],
			render(el, panelCtx) {
				const doc = el.ownerDocument;
				const root = doc.createElement('div');
				root.className = 'restyler-ots';
				el.appendChild(root);
				let last = null;

				function paint() {
					const room = panelCtx.getRoom();
					const sheets = teamSheets(room?.battle, { ownSideId: room?.side?.id || null });
					const signature = JSON.stringify(sheets);
					if (signature === last) return;
					last = signature;
					renderSheets(doc, root, sheets);
				}

				panelCtx.subscribe(paint);
				paint();
				return () => root.remove();
			},
		});
	},
};
