import { createPatcher } from './patch.js';

/**
 * Diffs the client's rooms on every `check()` and reports changes through `emit`:
 * `room:open {room}`, `room:close {id}`, `room:focus {room}`, `battle:start {room}`.
 * A room object replaced under the same id (the client swaps placeholders for real rooms) counts as
 * close then open. `onOpen(room)` / `onClose(id)` let the caller attach per-room hooks first.
 */
export function createRoomWatcher({ getRooms, getFocused, isBattle, hasBattle, emit, onOpen = () => {}, onClose = () => {} }) {
	const known = new Map(); // id -> room
	const started = new WeakSet();
	let focused = null;

	function check() {
		const current = new Map(getRooms().map(room => [room.id, room]));
		for (const [id, room] of known) {
			if (current.get(id) === room) continue;
			known.delete(id);
			onClose(id);
			emit('room:close', { id });
		}
		for (const [id, room] of current) {
			if (known.get(id) === room) continue;
			known.set(id, room);
			onOpen(room);
			emit('room:open', { room });
		}
		for (const room of known.values()) {
			if (!started.has(room) && isBattle(room) && hasBattle(room)) {
				started.add(room);
				emit('battle:start', { room });
			}
		}
		const now = getFocused() || null;
		if (now !== focused) {
			focused = now;
			if (now) emit('room:focus', { room: now });
		}
	}

	return { check };
}

/**
 * Wires the watcher to a host: re-checks on every client update (and once a second, in case a room
 * changes without a client-wide update), and wraps `receiveLine` on each battle room instance to emit
 * `battle:line {room, args}`. Wrapping the instance rather than the prototype keeps working when
 * another script already wrapped a prototype. Returns a stop function that restores everything.
 */
export function startRoomEvents({ host, bus, setIntervalFn = setInterval, clearIntervalFn = clearInterval }) {
	const patchers = new Map(); // room id -> patcher

	const watcher = createRoomWatcher({
		getRooms: () => host.rooms(),
		getFocused: () => host.focused(),
		isBattle: room => host.isBattleRoom(room),
		hasBattle: room => !!room.battle,
		emit: (event, payload) => bus.emit(event, payload),
		onOpen(room) {
			if (!host.isBattleRoom(room) || typeof room.receiveLine !== 'function') return;
			const patcher = createPatcher();
			patcher.patch(room, 'receiveLine', function (prev, args, ...rest) {
				const result = prev.call(this, args, ...rest);
				if (Array.isArray(args)) bus.emit('battle:line', { room, args });
				return result;
			});
			patchers.set(room.id, patcher);
		},
		onClose(id) {
			patchers.get(id)?.undoAll();
			patchers.delete(id);
		},
	});

	const unsubscribe = host.subscribe(() => watcher.check());
	const timer = setIntervalFn(() => watcher.check(), 1000);
	watcher.check();

	return function stop() {
		unsubscribe();
		clearIntervalFn(timer);
		for (const patcher of patchers.values()) patcher.undoAll();
		patchers.clear();
	};
}
