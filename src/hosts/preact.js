import { CLIENT } from '../core/layout.js';

/** Adapter for the new (Preact) client. Everything client-specific lives here. */
export function createPreactHost(win) {
	const PS = win.PS;
	const PSView = win.PSView;

	const sideBySidePreferred = () => {
		const pref = PS.prefs.battlelayout;
		return !pref || pref === 'side-by-side' || pref === 'side-by-side-overlay';
	};

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
			const el = win.document.documentElement;
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
				CLIENT.sideBySideAbove + 1 :
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

		/** Re-runs the client's layout and render (PS.update calls updateLayout). */
		requestLayout: () => PS.update(),

		/** Returns an unsubscribe function. */
		subscribe(fn) {
			const subscription = PS.subscribe(fn);
			return () => subscription.unsubscribe();
		},
	};
}
