import { CLIENT, sideSlots } from '../core/layout.js';
import { chooseSideRooms, pinRoom, unpinRoom } from '../core/side-rooms.js';

const TAB_PREFIX = 'roomtab-';

/**
 * Shows several right-hand rooms at once. Drag a side tab onto the side area and drop it where you want
 * it (drop zones preview the exact slot); the rooms you placed are pinned, and a chip on each slot
 * unpins it. With nothing pinned, `layout.side.pinned` rooms are chosen automatically (Home excluded).
 * Wraps PSView.posStyle to give each shown room a slot and PS.isVisible so the client keeps rendering
 * them. With one room shown it is an exact pass-through.
 */
export default {
	id: 'multi-side',
	name: 'Multiple side tabs',
	clients: ['preact'],
	requires: ['core-layout'],
	defaults: {},

	setup(ctx) {
		const { host } = ctx;
		const doc = host.doc ?? document;

		function chosenIds() {
			const side = ctx.layout.get().side;
			return chooseSideRooms({
				rightIds: host.rightRoomIds(),
				focusedId: host.focusedRightId(),
				pinnedIds: side.pinnedRooms || [],
				count: Math.min(side.pinned, CLIENT.maxPinned),
				includeHome: !!side.includeHome,
				max: CLIENT.maxPinned,
			});
		}

		function sideRect() {
			const { width, height } = host.viewport();
			const leftWidth = host.leftPanelWidth();
			return { top: CLIENT.topbar, left: leftWidth + 1, width: width - leftWidth - 1, height: height - CLIENT.topbar };
		}

		function pinnedSlots() {
			if (!host.isTwoPanel()) return null;
			const ids = chosenIds();
			if (ids.length < 2) return null;
			const side = ctx.layout.get().side;
			const slots = sideSlots({ ...side, sizes: null, pinned: ids.length }, sideRect());
			return new Map(host.roomsByIds(ids).map((room, i) => [room, { ...slots[i], id: room.id }]));
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

		// --- pin / unpin -------------------------------------------------------------------------

		function setPinned(ids) {
			ctx.layout.set({ side: { pinnedRooms: ids } });
			host.requestLayout();
		}

		function dropOn(roomId, index) {
			const side = ctx.layout.get().side;
			setPinned(pinRoom({
				pinnedIds: side.pinnedRooms || [],
				shownIds: chosenIds(),
				rightIds: host.rightRoomIds(),
				roomId,
				index,
				max: CLIENT.maxPinned,
			}));
		}

		// --- chips: one per pinned slot, to unpin it --------------------------------------------

		const chipLayer = doc.createElement('div');
		chipLayer.className = 'restyler-chips';
		let frame = 0;

		function syncChips() {
			frame = 0;
			const side = ctx.layout.get().side;
			const slots = pinnedSlots();
			const pinned = new Set(side.pinnedRooms || []);
			chipLayer.replaceChildren();
			if (slots) {
				for (const [room, slot] of slots) {
					if (!pinned.has(room.id)) continue;
					const chip = doc.createElement('button');
					chip.type = 'button';
					chip.className = 'restyler-chip';
					chip.title = 'Unpin this tab';
					chip.textContent = `${room.title || room.id}  ✕`;
					chip.style.top = `${slot.top + 4}px`;
					chip.style.right = `${Math.max(0, host.viewport().width - (slot.left + slot.width)) + 18}px`;
					chip.addEventListener('click', () => setPinned(unpinRoom(side.pinnedRooms || [], room.id)));
					chipLayer.append(chip);
				}
			}
			if (chipLayer.childElementCount && !chipLayer.isConnected) doc.body.append(chipLayer);
			if (!chipLayer.childElementCount) chipLayer.remove();
			ctx.css(css(side.pinnedRooms || []));
		}

		function scheduleChips() {
			if (!frame) frame = requestAnimationFrame(syncChips);
		}

		function css(pinnedIds) {
			const marks = pinnedIds.map(id => `#${TAB_PREFIX}${CSS.escape(id)}`);
			return `
.restyler-chips{position:fixed;inset:0;pointer-events:none;z-index:900}
.restyler-chip{position:fixed;pointer-events:auto;font-size:11px;line-height:1.2;padding:2px 7px;border-radius:10px;border:1px solid #7c8cff;background:rgba(124,140,255,.9);color:#fff;cursor:pointer;opacity:.75}
.restyler-chip:hover{opacity:1}
.restyler-dropzones{position:fixed;z-index:2000}
.restyler-dropzone{position:fixed;box-sizing:border-box;border:2px dashed #7c8cff;border-radius:6px;background:rgba(124,140,255,.14);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.6);pointer-events:auto}
.restyler-dropzone.restyler-hover{background:rgba(124,140,255,.45);border-style:solid}
${marks.length ? `${marks.join(',')}{box-shadow:inset 0 -3px 0 #7c8cff !important}` : ''}`;
		}

		ctx.on('layout:change', scheduleChips);
		const unsubscribe = host.subscribe(scheduleChips);
		ctx.onDispose(unsubscribe);
		ctx.onDispose(() => {
			if (frame) cancelAnimationFrame(frame);
			chipLayer.remove();
		});
		window.addEventListener('resize', scheduleChips);
		ctx.onDispose(() => window.removeEventListener('resize', scheduleChips));
		scheduleChips();

		// --- dragging a tab: show where it can land ----------------------------------------------

		let zones = null;

		function endDrag() {
			zones?.remove();
			zones = null;
		}

		function startDrag(roomId) {
			if (!host.isTwoPanel() || !host.rightRoomIds().includes(roomId)) return;
			const side = ctx.layout.get().side;
			const others = chosenIds().filter(id => id !== roomId);
			if (!others.length) return;
			const slots = sideSlots({ ...side, sizes: null, pinned: others.length + 1 }, sideRect());
			const horizontal = side.split === 'horizontal';
			zones = doc.createElement('div');
			zones.className = 'restyler-dropzones';
			slots.forEach((slot, index) => {
				const zone = doc.createElement('div');
				zone.className = 'restyler-dropzone';
				zone.textContent = horizontal ? (index === 0 ? 'Left' : index === slots.length - 1 ? 'Right' : 'Here') :
					(index === 0 ? 'Top' : index === slots.length - 1 ? 'Bottom' : 'Here');
				Object.assign(zone.style, {
					top: `${slot.top}px`, left: `${slot.left}px`, width: `${slot.width}px`, height: `${slot.height}px`,
				});
				zone.addEventListener('dragover', event => {
					event.preventDefault();
					event.dataTransfer.dropEffect = 'move';
					zone.classList.add('restyler-hover');
				});
				zone.addEventListener('dragleave', () => zone.classList.remove('restyler-hover'));
				zone.addEventListener('drop', event => {
					event.preventDefault();
					event.stopPropagation();
					endDrag();
					dropOn(roomId, index);
				});
				zones.append(zone);
			});
			doc.body.append(zones);
		}

		const onDragStart = event => {
			const tab = event.target?.closest?.('a.roomtab[id^="' + TAB_PREFIX + '"]');
			if (!tab) return;
			const roomId = tab.id.slice(TAB_PREFIX.length);
			setTimeout(() => startDrag(roomId), 0);
		};
		doc.addEventListener('dragstart', onDragStart, true);
		doc.addEventListener('dragend', endDrag, true);
		ctx.onDispose(() => {
			doc.removeEventListener('dragstart', onDragStart, true);
			doc.removeEventListener('dragend', endDrag, true);
			endDrag();
		});
	},
};
