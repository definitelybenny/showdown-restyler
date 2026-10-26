import { CLIENT } from '../core/layout.js';

/** Room ids must match /^[a-z0-9-]+$/ and must not collide with the client's own prefixes. */
export function sideRoomId(panelId) {
	return `restyler-${panelId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/** Adapter for the new (Preact) client. Everything client-specific lives here. */
export function createPreactHost(win) {
	const PS = win.PS;
	const PSView = win.PSView;
	const doc = win.document;

	const sideBySidePreferred = () => {
		const pref = PS.prefs.battlelayout;
		return !pref || pref === 'side-by-side' || pref === 'side-by-side-overlay';
	};

	const isBattleRoom = room => !!room && (room.classType === 'battle' || room.type === 'battle');
	const sideTypes = new Map(); // panel id -> { typeId, mount }

	/** The panel classes load deferred, so they are only resolved when a side room is first opened. */
	function ensureSideType(spec) {
		const { PSRoomPanel, PSPanelWrapper, preact } = win;
		if (!PSRoomPanel || !PSPanelWrapper || !preact) throw new Error('panel classes are not loaded yet');
		const typeId = sideRoomId(spec.id);
		const existing = sideTypes.get(typeId);
		if (existing) {
			existing.mount = spec.mount;
			return existing;
		}
		const entry = { typeId, mount: spec.mount, cleanups: new Map() };

		class RestylerPanel extends PSRoomPanel {
			// Stable ref: a new function per render would unmount and remount the panel every update.
			setRoot = el => {
				const room = this.props.room;
				entry.cleanups.get(room.id)?.();
				entry.cleanups.delete(room.id);
				if (!el) return;
				try {
					const cleanup = entry.mount(el, room);
					if (typeof cleanup === 'function') entry.cleanups.set(room.id, cleanup);
				} catch (err) {
					console.error('[Restyler] side panel failed', err);
				}
			};
			render() {
				// Preact leaves children it did not create alone, so panels render into this empty div.
				return preact.h(PSPanelWrapper, { room: this.props.room },
					preact.h('div', { class: 'restyler-panel-root', ref: this.setRoot }));
			}
		}
		Object.assign(RestylerPanel, {
			id: typeId,
			routes: [typeId],
			location: 'right',
			title: spec.title || spec.id,
			noURL: true,
			icon: spec.icon || preact.h('i', { class: 'fa fa-th-large', 'aria-hidden': true }),
		});
		PS.addRoomType(RestylerPanel);
		sideTypes.set(typeId, entry);
		return entry;
	}

	function removeSideType(typeId) {
		const type = PS.roomTypes[typeId];
		if (type) for (const route of type.routes) if (PS.routes[route] === typeId) delete PS.routes[route];
		delete PS.roomTypes[typeId];
		sideTypes.delete(typeId);
	}

	return {
		kind: 'preact',
		PS,
		PSView,

		/** The functions the layout modules wrap, as `[owner, key]` pairs. */
		layoutHooks: {
			chooseBattleLayout: [PS, 'chooseBattleLayout'],
			calculateLeftPanelWidth: [PS, 'calculateLeftPanelWidth'],
			posStyle: [PSView, 'posStyle'],
			isVisible: [PS, 'isVisible'],
		},

		viewport() {
			const el = doc.documentElement;
			return { width: el.clientWidth, height: el.clientHeight };
		},

		/** Width of the left panel as the client currently has it: number, 0 (one panel) or null (vertical). */
		leftPanelWidth: () => PS.leftPanelWidth,
		isTwoPanel: () => !!PS.leftPanelWidth && !!PS.leftPanel && !!PS.rightPanel,

		/** Limits fed to `resolveLeftWidth` so a drag cannot trip the client's tiny-layout breakpoints. */
		leftWidthLimits() {
			const left = PS.leftPanel;
			const right = PS.rightPanel;
			const minLeft = left?.type === 'battle' && sideBySidePreferred() ?
				CLIENT.battleMinLeft :
				left ? PS.getWidthFor(left).minWidth : CLIENT.sideBySideAbove + 1;
			const minRight = right ? PS.getWidthFor(right).minWidth : CLIENT.minRight;
			return { minLeft, minRight };
		},

		/** Up to `count` right-hand rooms: the focused right panel first, then the most recently added. */
		rightRooms(count) {
			const rooms = [];
			if (PS.rightPanel) rooms.push(PS.rightPanel);
			for (let i = PS.rightRoomList.length - 1; i >= 0 && rooms.length < count; i--) {
				const room = PS.rooms[PS.rightRoomList[i]];
				if (room && !rooms.includes(room)) rooms.push(room);
			}
			return rooms;
		},

		room: id => PS.rooms[id],
		rooms: () => Object.values(PS.rooms),
		focused: () => PS.room,
		isBattleRoom,
		battleRooms: () => Object.values(PS.rooms).filter(isBattleRoom),

		/** The room's root element. Never cache it: Preact recreates it. */
		roomElement: room => (room ? doc.getElementById(`room-${room.id}`) : null),

		/** Re-runs the client's layout and render (PS.update calls updateLayout). */
		requestLayout: () => PS.update(),

		/** Returns an unsubscribe function. */
		subscribe(fn) {
			const subscription = PS.subscribe(fn);
			return () => subscription.unsubscribe();
		},

		/**
		 * Opens a client-only right-hand room (the same technique Showdex and Mock Regional Helper use) and
		 * calls `mount(rootEl, room)` for its content; `mount` may return a cleanup function.
		 * @returns {{ roomId, close(), dispose() }}; `close` leaves the room, `dispose` also forgets the room
		 *   type (PS.addRoomType has no inverse of its own).
		 */
		openSideRoom(spec) {
			const entry = ensureSideType(spec);
			PS.join(entry.typeId, { noURL: true, autofocus: spec.focus !== false, autoclosePopups: false });
			PS.update();
			const close = () => {
				// Client-only room (connectMode null): leave sends nothing to the server.
				if (PS.rooms[entry.typeId]) PS.leave(entry.typeId);
			};
			return {
				roomId: entry.typeId,
				close,
				dispose() {
					close();
					removeSideType(entry.typeId);
				},
			};
		},

		/**
		 * Opens a pop-out window and calls `mount(rootEl, win)` in it; `mount` may return a cleanup function.
		 * Our `<style data-restyler>` tags are copied so panels look the same. Returns null if blocked.
		 */
		openPopout({ id, title, mount, width = 520, height = 640 }) {
			const popup = win.open('', `restyler-${id}`, `popup,width=${width},height=${height}`);
			if (!popup) return null;
			const pdoc = popup.document;
			pdoc.title = title || id;
			pdoc.body.style.cssText = 'margin:0;background:var(--rs-bg,#0f1115);color:var(--rs-text,#e6e9f0);font:12px/1.4 var(--rs-font,system-ui,sans-serif)';
			for (const style of doc.querySelectorAll('style[data-restyler]')) {
				pdoc.head.appendChild(pdoc.importNode(style, true));
			}
			const root = pdoc.createElement('div');
			root.className = 'restyler-panel-root';
			pdoc.body.replaceChildren(root);
			let cleanup;
			try {
				cleanup = mount(root, popup);
			} catch (err) {
				console.error('[Restyler] pop-out failed', err);
				popup.close();
				return null;
			}
			let closed = false;
			const finish = () => {
				if (closed) return;
				closed = true;
				clearInterval(timer);
				win.removeEventListener('beforeunload', close);
				if (typeof cleanup === 'function') cleanup();
			};
			const timer = setInterval(() => popup.closed && finish(), 500);
			function close() {
				finish();
				if (!popup.closed) popup.close();
			}
			win.addEventListener('beforeunload', close);
			return { close };
		},

		/** Dark/light state. `set` writes the client's own preference, which Showdex and the client follow. */
		theme: {
			get: () => PS.prefs.theme,
			isDark: () => doc.body.classList.contains('dark'),
			set: value => PS.prefs.set('theme', value),
			/** Returns an unsubscribe function; `fn` runs on any client preference change. */
			subscribe(fn) {
				const subscription = PS.prefs.subscribe(fn);
				return () => subscription.unsubscribe();
			},
		},
	};
}
