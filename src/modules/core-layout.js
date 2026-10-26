import { CLIENT, resolveLeftWidth, sideSlots } from '../core/layout.js';

const GUTTER_WIDTH = 7;

/**
 * Left/right split: wraps PS.calculateLeftPanelWidth, one draggable gutter, and (when
 * layout.side.pinned > 1) PSView.posStyle + PS.isVisible so several right-hand rooms render at once.
 * With the defaults it is an exact pass-through apart from the gutter.
 */
export default {
	id: 'core-layout',
	name: 'Core layout',
	clients: ['preact'],
	defaults: {},

	css: () => `
.restyler-gutter{position:fixed;top:${CLIENT.topbar}px;bottom:0;width:${GUTTER_WIDTH}px;z-index:1000;cursor:col-resize;touch-action:none}
.restyler-gutter:hover,.restyler-gutter.restyler-dragging{background:rgba(110,150,255,.35)}
html.restyler-dragging,html.restyler-dragging *{user-select:none!important;cursor:col-resize!important}
`,

	setup(ctx) {
		const { host, layout } = ctx;

		ctx.patch(...host.layoutHooks.calculateLeftPanelWidth, function (prev, ...args) {
			const stock = prev.apply(this, args);
			// null = vertical tabs, 0 = one panel: nothing to split.
			if (!(stock > 0)) return stock;
			const width = resolveLeftWidth(layout.get().leftWidth, host.viewport().width, host.leftWidthLimits());
			return width ?? stock;
		});

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

		installGutter(ctx);
	},
};

function installGutter(ctx) {
	const { host } = ctx;
	const doc = document;
	const gutter = doc.createElement('div');
	gutter.className = 'restyler-gutter';
	gutter.title = 'Drag to resize. Double-click to reset.';

	function place() {
		const width = host.leftPanelWidth();
		gutter.style.display = width > 0 ? '' : 'none';
		if (width > 0) gutter.style.left = `${width - Math.floor(GUTTER_WIDTH / 2)}px`;
		if (!gutter.isConnected) doc.body.appendChild(gutter);
	}

	let frame = 0;
	function relayout() {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			host.requestLayout();
		});
	}

	let dragging = false;
	let removeDragClass = null;

	gutter.addEventListener('pointerdown', event => {
		if (event.button !== 0) return;
		dragging = true;
		gutter.setPointerCapture(event.pointerId);
		gutter.classList.add('restyler-dragging');
		removeDragClass = ctx.htmlClass('restyler-dragging');
		event.preventDefault();
	});
	gutter.addEventListener('pointermove', event => {
		if (!dragging) return;
		const { width } = host.viewport();
		const ratio = Math.round((event.clientX / width) * 10000) / 10000;
		ctx.layout.set({ leftWidth: ratio }, { persist: false });
		relayout();
	});
	function endDrag() {
		if (!dragging) return;
		dragging = false;
		gutter.classList.remove('restyler-dragging');
		removeDragClass?.();
		removeDragClass = null;
		ctx.layout.flush();
	}
	gutter.addEventListener('pointerup', endDrag);
	gutter.addEventListener('pointercancel', endDrag);
	gutter.addEventListener('dblclick', () => {
		ctx.layout.set({ leftWidth: null });
		host.requestLayout();
	});

	const unsubscribe = host.subscribe(place);
	ctx.on('layout:change', place);
	window.addEventListener('resize', place);
	place();

	ctx.onDispose(() => {
		unsubscribe();
		window.removeEventListener('resize', place);
		if (frame) cancelAnimationFrame(frame);
		endDrag();
		gutter.remove();
	});
}
