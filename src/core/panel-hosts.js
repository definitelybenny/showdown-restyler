/**
 * Opens registered panels in the hosts that need the client: a side room or a pop-out window.
 * (The dock and the battle column are elements inside a battle room, owned by their modules.)
 * Side rooms and pop-outs are not tied to one battle, so their `getRoom` follows the battle the user
 * looked at last. A handle is closed automatically when its panel is unregistered.
 */
export function createPanelHosts({ host, panels, bus }) {
	let lastBattle = host.battleRooms().find(room => room === host.focused()) || null;
	bus.on('room:focus', ({ room }) => {
		if (host.isBattleRoom(room)) lastBattle = room;
	});
	bus.on('room:close', ({ id }) => {
		if (lastBattle && lastBattle.id === id) lastBattle = null;
	});
	const getRoom = () => lastBattle || host.battleRooms()[0] || null;

	const open = new Map(); // `${where}:${panelId}` -> { close }

	function track(key, panelId, handle) {
		open.set(key, { panelId, close: handle.close });
		return handle;
	}

	/** @param where 'side' | 'popout'. Returns a handle with `close()`, or null when it could not open. */
	function openPanel(panelId, where) {
		const def = panels.list(where).find(p => p.id === panelId);
		if (!def) return null;
		const key = `${where}:${panelId}`;
		open.get(key)?.close();
		const mount = el => {
			const instance = panels.mount(panelId, el, { getRoom, host });
			return () => instance?.unmount();
		};
		let handle;
		try {
			if (where === 'side') {
				const room = host.openSideRoom({ id: panelId, title: def.title, mount });
				handle = { close: room.dispose };
			} else if (where === 'popout') {
				handle = host.openPopout({ id: panelId, title: def.title, mount });
			}
		} catch (err) {
			console.error(`[Restyler] could not open panel ${panelId} in ${where}`, err);
			return null;
		}
		return handle ? track(key, panelId, handle) : null;
	}

	bus.on('panel:unregister', ({ id }) => {
		for (const [key, entry] of [...open]) {
			if (entry.panelId !== id) continue;
			open.delete(key);
			entry.close();
		}
	});

	function closeAll() {
		for (const entry of [...open.values()]) entry.close();
		open.clear();
	}

	return { openPanel, closeAll, getRoom };
}
