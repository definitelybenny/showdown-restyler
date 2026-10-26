import { CLIENT, sideSlots } from '../core/layout.js';

/**
 * Shows several right-hand rooms at once. Wraps PSView.posStyle to give each of the `layout.side.pinned`
 * most relevant right rooms a slot (stacked or in columns, see `layout.side.split`) and PS.isVisible so
 * the client keeps rendering them. The count and split live in `layout` (presets set them); the settings
 * drawer edits them in its Layout section. With `pinned: 1` it is an exact pass-through.
 */
export default {
	id: 'multi-side',
	name: 'Multiple side tabs',
	clients: ['preact'],
	requires: ['core-layout'],
	defaults: {},

	setup(ctx) {
		const { host, layout } = ctx;

		function pinnedSlots() {
			const side = layout.get().side;
			if (!(side.pinned > 1) || !host.isTwoPanel()) return null;
			const rooms = host.rightRooms(Math.min(side.pinned, CLIENT.maxPinned));
			if (rooms.length < 2) return null;
			const { width, height } = host.viewport();
			const leftWidth = host.leftPanelWidth();
			const slots = sideSlots({ ...side, pinned: rooms.length }, {
				top: CLIENT.topbar,
				left: leftWidth + 1,
				width: width - leftWidth - 1,
				height: height - CLIENT.topbar,
			});
			return new Map(rooms.map((room, i) => [room, slots[i]]));
		}

		ctx.patch(...host.layoutHooks.posStyle, function (prev, room, ...rest) {
			const slot = pinnedSlots()?.get(room);
			if (!slot) return prev.call(this, room, ...rest);
			return {
				top: `${slot.top}px`,
				left: `${slot.left}px`,
				width: `${slot.width}px`,
				height: `${slot.height}px`,
				right: 'auto',
				bottom: 'auto',
			};
		});

		ctx.patch(...host.layoutHooks.isVisible, function (prev, room, ...rest) {
			if (pinnedSlots()?.has(room)) return true;
			return prev.call(this, room, ...rest);
		});
	},
};
