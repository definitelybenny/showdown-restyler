import { createChatLog, formatTime, parseChatLine } from '../core/chat.js';
import { createRoomAttachments, autoSync } from '../core/attach.js';

const MIN_CHAT = 80;
const MIN_LOG = 120;

/** Keeps the chat strip between its minimum and what leaves the battle log MIN_LOG px. */
export function clampChatHeight(height, available) {
	const max = Math.max(MIN_CHAT, available - MIN_LOG);
	return Math.round(Math.min(max, Math.max(MIN_CHAT, Number(height) || MIN_CHAT)));
}

function lineElement(doc, message) {
	const line = doc.createElement('div');
	line.className = 'restyler-chat-line';
	const time = formatTime(message.time);
	if (time) {
		const t = doc.createElement('time');
		t.textContent = time;
		line.appendChild(t);
	}
	const who = doc.createElement('b');
	who.textContent = message.action ? `* ${message.user}` : `${message.rank}${message.user}`;
	line.appendChild(who);
	line.appendChild(doc.createTextNode(message.action ? ` ${message.text}` : `: ${message.text}`));
	return line;
}

/**
 * Splits the battle log in two. The native log keeps the battle lines (CSS hides its `.chat` lines) and
 * a Chat panel, fed by `battle:line`, sits between it and the native chat input, so the input stays
 * where the client put it and keeps its focus and history. The panel is also registered as a normal
 * panel (`chat`), so it can live in the dock, a side room or a pop-out.
 */
export default {
	id: 'log-chat-split',
	name: 'Log / Chat split',
	clients: ['preact'],
	defaults: { hideChat: false, chatHeight: 180 },
	schema: {
		hideChat: { label: 'Hide chat in battles', help: 'Log only: no chat strip, chat lines hidden.' },
		chatHeight: { label: 'Chat height (px)', min: 80, max: 600, step: 10 },
	},

	css: () => `
[data-restyler-chat] .battle-log .chat{display:none!important}
[data-restyler-chat=split] .battle-log{bottom:var(--rs-log-bottom)!important}
.restyler-chat{position:absolute;z-index:5;display:flex;flex-direction:column;box-sizing:border-box;background:var(--rs-panel,#171a21);color:var(--rs-text,#e6e9f0);border-top:1px solid var(--rs-border,#2a3040);font:12px/1.4 var(--rs-font,system-ui,sans-serif)}
.restyler-chat-handle{position:absolute;left:0;right:0;top:-3px;height:6px;cursor:row-resize;touch-action:none}
.restyler-chat-handle:hover,.restyler-chat-handle.restyler-dragging{background:var(--rs-accent,#7c8cff);opacity:.5}
.restyler-chat-head{flex:none;padding:2px 10px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--rs-muted,#8b93a7);background:var(--rs-panel-2,#1d212a);border-bottom:1px solid var(--rs-border,#2a3040)}
.restyler-chat-body{flex:1;min-height:0;display:flex;flex-direction:column}
.restyler-chat-list{flex:1;min-height:0;overflow:auto;padding:4px 10px;scrollbar-width:thin}
.restyler-chat-line{padding:1px 0;word-wrap:break-word}
.restyler-chat-line time{color:var(--rs-muted,#8b93a7);font-size:10px;margin-right:6px}
.restyler-chat-line b{font-weight:600}
.restyler-chat-empty{padding:8px 10px;color:var(--rs-muted,#8b93a7)}
`,

	setup(ctx) {
		const logs = new Map(); // room id -> chat log

		/**
		 * A room's chat log is created once its battle exists and seeded from `battle.stepQueue`. Lines that
		 * arrive earlier are ignored on purpose: they are in the stepQueue too, so taking them would duplicate.
		 */
		function logFor(room) {
			let log = logs.get(room.id);
			if (!log && room.battle) {
				log = createChatLog();
				log.seed(room.battle.stepQueue);
				logs.set(room.id, log);
			}
			return log || null;
		}

		ctx.on('battle:start', ({ room }) => logFor(room));
		ctx.on('battle:line', ({ room, args }) => {
			const log = logs.get(room.id);
			if (!log) return;
			const message = parseChatLine(args);
			if (message) log.add(message);
		});
		ctx.on('room:close', ({ id }) => logs.delete(id));
		for (const room of ctx.host.battleRooms()) logFor(room);

		ctx.panels.register({
			id: 'chat',
			title: 'Chat',
			hosts: ['column', 'dock', 'side', 'popout'],
			render(el, panelCtx) {
				const doc = el.ownerDocument;
				const list = doc.createElement('div');
				list.className = 'restyler-chat-list';
				el.appendChild(list);
				let current = null;
				let shown = -1;
				let offLog = null;

				function paint() {
					const room = panelCtx.getRoom();
					const log = room ? logFor(room) : null;
					if (log !== current) {
						offLog?.();
						current = log;
						shown = -1;
						offLog = log ? log.subscribe(paint) : null;
					}
					const revision = log ? log.revision() : -2;
					if (revision === shown) return;
					shown = revision;
					const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
					if (!log) {
						const empty = doc.createElement('div');
						empty.className = 'restyler-chat-empty';
						empty.textContent = 'No battle selected.';
						list.replaceChildren(empty);
						return;
					}
					list.replaceChildren(...log.messages().map(m => lineElement(doc, m)));
					if (stick) list.scrollTop = list.scrollHeight;
				}

				panelCtx.subscribe(paint);
				paint();
				return () => {
					offLog?.();
					list.remove();
				};
			},
		});

		const attachments = createRoomAttachments({
			host: ctx.host,
			create(room, roomEl) {
				const doc = roomEl.ownerDocument;
				const root = doc.createElement('div');
				root.className = 'restyler-chat';
				const handle = doc.createElement('div');
				handle.className = 'restyler-chat-handle';
				const head = doc.createElement('div');
				head.className = 'restyler-chat-head';
				head.textContent = 'Chat';
				const body = doc.createElement('div');
				body.className = 'restyler-chat-body';
				root.append(handle, head, body);
				const entry = { root, roomEl, room, height: null, mount: ctx.panels.mount('chat', body, { getRoom: () => room }) };

				let startY = 0;
				let startHeight = 0;
				handle.addEventListener('pointerdown', event => {
					if (event.button !== 0) return;
					handle.setPointerCapture(event.pointerId);
					handle.classList.add('restyler-dragging');
					startY = event.clientY;
					startHeight = root.offsetHeight;
					event.preventDefault();
				});
				handle.addEventListener('pointermove', event => {
					if (!handle.hasPointerCapture(event.pointerId)) return;
					entry.height = startHeight + (startY - event.clientY);
					schedule();
				});
				const endDrag = () => {
					handle.classList.remove('restyler-dragging');
					if (entry.height != null) {
						ctx.settings.set('chatHeight', clampChatHeight(entry.height, entry.roomEl.clientHeight));
						entry.height = null;
					}
				};
				handle.addEventListener('pointerup', endDrag);
				handle.addEventListener('pointercancel', endDrag);
				return entry;
			},
			update(entry, room, roomEl) {
				entry.roomEl = roomEl;
				const log = roomEl.querySelector('.battle-log');
				if (ctx.settings.get('hideChat')) {
					roomEl.setAttribute('data-restyler-chat', 'hidden');
					entry.root.style.display = 'none';
					return;
				}
				// Side-by-side layout only: the log then has an inline `left` past the field.
				if (!log || !(parseFloat(log.style.left) > 0)) {
					roomEl.removeAttribute('data-restyler-chat');
					entry.root.style.display = 'none';
					return;
				}
				const inputReserve = parseFloat(log.style.bottom) || 40;
				const height = clampChatHeight(entry.height ?? ctx.settings.get('chatHeight'), roomEl.clientHeight - inputReserve);
				roomEl.setAttribute('data-restyler-chat', 'split');
				roomEl.style.setProperty('--rs-log-bottom', `${inputReserve + height}px`);
				Object.assign(entry.root.style, {
					display: 'flex',
					left: log.style.left,
					right: '0',
					bottom: `${inputReserve}px`,
					height: `${height}px`,
				});
			},
			destroy(entry) {
				entry.mount?.unmount();
				entry.root.remove();
				entry.roomEl.removeAttribute('data-restyler-chat');
				entry.roomEl.style.removeProperty('--rs-log-bottom');
			},
		});

		const schedule = autoSync(ctx, attachments);
		ctx.on('settings:change', e => e.module === 'log-chat-split' && schedule());
	},
};
