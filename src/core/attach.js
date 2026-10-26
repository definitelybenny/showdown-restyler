/**
 * Keeps one of our own elements inside each battle room. Room DOM is never cached: every `sync()`
 * re-resolves `#room-<id>` and re-attaches our element if Preact replaced the room element.
 * `create(room, roomEl)` returns an entry `{ root, ... }`, `update(entry, room, roomEl)` positions it
 * (called on every sync), `destroy(entry)` tears it down. Entries of rooms that are gone or not
 * rendered are destroyed.
 */
export function createRoomAttachments({ host, create, update, destroy }) {
	const entries = new Map(); // room id -> entry

	function drop(id) {
		const entry = entries.get(id);
		if (!entry) return;
		entries.delete(id);
		destroy(entry);
	}

	function sync() {
		const live = new Set();
		for (const room of host.battleRooms()) {
			const roomEl = host.roomElement(room);
			if (!roomEl) continue;
			live.add(room.id);
			let entry = entries.get(room.id);
			if (!entry) {
				entry = create(room, roomEl);
				entries.set(room.id, entry);
			}
			if (entry.root.parentNode !== roomEl) roomEl.appendChild(entry.root);
			update(entry, room, roomEl);
		}
		for (const id of [...entries.keys()]) if (!live.has(id)) drop(id);
	}

	function dispose() {
		for (const id of [...entries.keys()]) drop(id);
	}

	return { sync, dispose, entries };
}

/**
 * Runs `attachments.sync` on every client update, room event and window resize, coalesced to one
 * call per animation frame, and once now. Everything is undone through `ctx.onDispose`.
 */
export function autoSync(ctx, attachments, win = window) {
	let frame = 0;
	const schedule = () => {
		if (frame) return;
		frame = win.requestAnimationFrame(() => {
			frame = 0;
			attachments.sync();
		});
	};
	const unsubscribe = ctx.host.subscribe(schedule);
	for (const event of ['room:open', 'room:close', 'room:focus', 'battle:start', 'layout:change']) ctx.on(event, schedule);
	win.addEventListener('resize', schedule);
	ctx.onDispose(() => {
		unsubscribe();
		win.removeEventListener('resize', schedule);
		if (frame) win.cancelAnimationFrame(frame);
		attachments.dispose();
	});
	attachments.sync();
	return schedule;
}
