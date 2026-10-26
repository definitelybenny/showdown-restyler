/**
 * Pure choice of which right-hand rooms are shown at once. No DOM, no client globals.
 * Pinned rooms (placed by dragging a tab onto the side area) win; with none pinned the first `count`
 * rooms are taken automatically, the Home room (`rooms`) excluded unless asked for or focused.
 */
export const HOME_ROOM_ID = 'rooms';

function unique(ids) {
	return [...new Set(ids)];
}

/**
 * @param rightIds   ids of the open right-hand rooms, in tab order
 * @param focusedId  id of the focused right-hand room, or null
 * @param pinnedIds  ordered ids the user pinned (may include closed rooms; they are skipped)
 * @param count      how many to show when nothing is pinned
 * @returns ordered ids to show; length 1 or less means "leave the stock layout alone"
 */
export function chooseSideRooms({ rightIds, focusedId = null, pinnedIds = [], count = 1, includeHome = false, max = 8 }) {
	const open = new Set(rightIds);
	const pinned = unique(pinnedIds).filter(id => open.has(id));
	if (pinned.length) {
		const shown = focusedId && open.has(focusedId) && !pinned.includes(focusedId) ? [focusedId, ...pinned] : pinned;
		return shown.slice(0, max);
	}
	const eligible = rightIds.filter(id => includeHome || id !== HOME_ROOM_ID || id === focusedId);
	const ordered = [];
	if (focusedId && eligible.includes(focusedId)) ordered.push(focusedId);
	for (let i = eligible.length - 1; i >= 0; i--) ordered.push(eligible[i]);
	return unique(ordered).slice(0, Math.min(Math.max(1, Math.floor(count) || 1), max));
}

/**
 * New pinned list after dropping `roomId` at insertion `index`. When nothing is pinned yet, the rooms
 * on screen (`shownIds`) are pinned first, so the first drop forms a pair with what you were looking at.
 */
export function pinRoom({ pinnedIds, shownIds, rightIds, roomId, index, max = 8 }) {
	const open = new Set(rightIds);
	const current = unique(pinnedIds).filter(id => open.has(id));
	const base = (current.length ? current : unique(shownIds)).filter(id => id !== roomId);
	const at = Math.max(0, Math.min(base.length, Math.floor(index) || 0));
	base.splice(at, 0, roomId);
	return base.slice(0, max);
}

export function unpinRoom(pinnedIds, roomId) {
	return pinnedIds.filter(id => id !== roomId);
}
