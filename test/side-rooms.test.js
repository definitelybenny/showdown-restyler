import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSideRooms, pinRoom, unpinRoom } from '../src/core/side-rooms.js';

const tabs = ['rooms', 'mockregional', 'calcdex'];

test('auto mode skips Home and prefers the focused then newest rooms', () => {
	assert.deepEqual(chooseSideRooms({ rightIds: tabs, focusedId: 'mockregional', count: 2 }), ['mockregional', 'calcdex']);
	assert.deepEqual(chooseSideRooms({ rightIds: tabs, focusedId: null, count: 2 }), ['calcdex', 'mockregional']);
});

test('auto mode shows Home only when focused or asked for', () => {
	assert.deepEqual(chooseSideRooms({ rightIds: tabs, focusedId: 'rooms', count: 2 }), ['rooms', 'calcdex']);
	assert.deepEqual(chooseSideRooms({ rightIds: tabs, focusedId: 'calcdex', count: 3, includeHome: true }), ['calcdex', 'mockregional', 'rooms']);
});

test('count 1 is a single room', () => {
	assert.deepEqual(chooseSideRooms({ rightIds: tabs, focusedId: 'calcdex', count: 1 }), ['calcdex']);
	assert.deepEqual(chooseSideRooms({ rightIds: [], focusedId: null, count: 2 }), []);
});

test('pinned rooms win, in order, and closed ones are skipped', () => {
	assert.deepEqual(chooseSideRooms({ rightIds: tabs, focusedId: 'calcdex', pinnedIds: ['calcdex', 'gone', 'mockregional'] }), ['calcdex', 'mockregional']);
});

test('a focused unpinned room is added in front', () => {
	assert.deepEqual(chooseSideRooms({ rightIds: tabs, focusedId: 'rooms', pinnedIds: ['mockregional', 'calcdex'] }), ['rooms', 'mockregional', 'calcdex']);
});

test('max caps the result', () => {
	assert.equal(chooseSideRooms({ rightIds: tabs, pinnedIds: tabs, max: 2 }).length, 2);
});

test('first drop pairs the dragged tab with what is on screen', () => {
	const next = pinRoom({ pinnedIds: [], shownIds: ['mockregional'], rightIds: tabs, roomId: 'calcdex', index: 1 });
	assert.deepEqual(next, ['mockregional', 'calcdex']);
	assert.deepEqual(pinRoom({ pinnedIds: [], shownIds: ['mockregional'], rightIds: tabs, roomId: 'calcdex', index: 0 }), ['calcdex', 'mockregional']);
});

test('dropping a pinned tab reorders it, and index is clamped', () => {
	assert.deepEqual(pinRoom({ pinnedIds: ['a', 'b', 'c'], shownIds: [], rightIds: ['a', 'b', 'c'], roomId: 'c', index: 0 }), ['c', 'a', 'b']);
	assert.deepEqual(pinRoom({ pinnedIds: ['a'], shownIds: [], rightIds: ['a', 'b'], roomId: 'b', index: 99 }), ['a', 'b']);
	assert.deepEqual(pinRoom({ pinnedIds: ['a'], shownIds: [], rightIds: ['a', 'b'], roomId: 'b', index: -5 }), ['b', 'a']);
});

test('unpin removes one id', () => {
	assert.deepEqual(unpinRoom(['a', 'b'], 'a'), ['b']);
});
