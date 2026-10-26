import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../src/core/modules.js';
import { createBus } from '../src/core/events.js';
import { createSettings } from '../src/core/settings.js';
import { createPanelRegistry } from '../src/core/panels.js';
import { createRoomWatcher, startRoomEvents } from '../src/core/room-events.js';
import { createRoomAttachments } from '../src/core/attach.js';

function fakeDoc() {
	const mk = () => {
		const classes = new Set();
		return { classList: { add: c => classes.add(c), remove: c => classes.delete(c), has: c => classes.has(c) }, setAttribute() {}, remove() {}, isConnected: false };
	};
	return { createElement: mk, documentElement: mk(), head: { appendChild() {} } };
}

function harness(modules) {
	const bus = createBus();
	const settings = createSettings({ storage: { load: () => null, save() {} }, emit: (e, p) => bus.emit(e, p), warn: () => {} });
	const host = { kind: 'preact', requestLayout() {}, battleRooms: () => [] };
	const panels = createPanelRegistry({ bus, emit: (e, p) => bus.emit(e, p) });
	const registry = createRegistry({ host, settings, bus, panels, doc: fakeDoc(), logger: { log() {}, error() {} } });
	for (const m of modules) registry.register(m);
	return { registry, settings, panels, bus };
}

const mod = (id, extra = {}) => ({ id, clients: ['preact'], defaults: {}, setup() {}, ...extra });

test('applyAll enables wanted modules and disables the rest, with dependents', () => {
	const { registry, settings } = harness([mod('a'), mod('b', { requires: ['a'] })]);
	registry.applyAll();
	assert.deepEqual([registry.isEnabled('a'), registry.isEnabled('b')], [true, true]);
	settings.setModule('a', { enabled: false });
	registry.applyAll();
	assert.deepEqual([registry.isEnabled('a'), registry.isEnabled('b')], [false, false], 'a dependent follows its requirement');
	registry.setEnabled('b', true);
	assert.deepEqual([registry.isEnabled('a'), registry.isEnabled('b')], [true, true]);
	assert.equal(settings.module('a').enabled, true, 'enabling b records its requirement as enabled');
	registry.setEnabled('b', false);
	assert.deepEqual([registry.isEnabled('a'), registry.isEnabled('b')], [true, false]);
});

test('disabling a module undoes its registered panels and ctx handlers', () => {
	const seen = [];
	const { registry, panels, bus } = harness([mod('a', {
		setup(ctx) {
			ctx.panels.register({ id: 'p', render() {} });
			ctx.on('x', () => seen.push('x'));
		},
	})]);
	registry.applyAll();
	assert.equal(panels.has('p'), true);
	bus.emit('x');
	registry.setEnabled('a', false);
	bus.emit('x');
	assert.equal(panels.has('p'), false);
	assert.deepEqual(seen, ['x']);
});

test('a failing setup does not stop other modules and leaves nothing registered', () => {
	const { registry, panels } = harness([
		mod('bad', { setup(ctx) { ctx.panels.register({ id: 'leak', render() {} }); throw new Error('nope'); } }),
		mod('good'),
	]);
	registry.applyAll();
	assert.equal(registry.isEnabled('good'), true);
	assert.equal(registry.isEnabled('bad'), false);
	assert.equal(panels.has('leak'), false);
});

test('describe exposes names, defaults and schema for the settings UI', () => {
	const { registry } = harness([mod('a', { name: 'Alpha', defaults: { x: 1 }, schema: { x: { min: 0 } } })]);
	assert.deepEqual(registry.describe(), [{ id: 'a', name: 'Alpha', defaults: { x: 1 }, schema: { x: { min: 0 } } }]);
});

test('room watcher reports open, close, replace, battle start and focus once', () => {
	const rooms = new Map();
	let focused = null;
	const events = [];
	const watcher = createRoomWatcher({
		getRooms: () => [...rooms.values()],
		getFocused: () => focused,
		isBattle: r => r.id.startsWith('battle-'),
		hasBattle: r => !!r.battle,
		emit: (e, p) => events.push([e, p.room?.id ?? p.id]),
	});
	const lobby = { id: 'lobby' };
	const b1 = { id: 'battle-1' };
	rooms.set('lobby', lobby);
	rooms.set('battle-1', b1);
	focused = b1;
	watcher.check();
	watcher.check();
	assert.deepEqual(events, [['room:open', 'lobby'], ['room:open', 'battle-1'], ['room:focus', 'battle-1']]);
	events.length = 0;
	b1.battle = {};
	watcher.check();
	watcher.check();
	assert.deepEqual(events, [['battle:start', 'battle-1']]);
	events.length = 0;
	rooms.set('lobby', { id: 'lobby' });
	rooms.delete('battle-1');
	focused = null;
	watcher.check();
	assert.deepEqual(events.map(e => e[0]).sort(), ['room:close', 'room:close', 'room:open']);
});

test('startRoomEvents wraps receiveLine per battle room, emits lines, and restores on stop', () => {
	const bus = createBus();
	const lines = [];
	bus.on('battle:line', ({ room, args }) => lines.push([room.id, args]));
	const original = function () { return 'orig'; };
	const room = { id: 'battle-1', receiveLine: original };
	let notify = () => {};
	const host = {
		rooms: () => [room],
		focused: () => null,
		isBattleRoom: () => true,
		subscribe: fn => {
			notify = fn;
			return () => {};
		},
	};
	const stop = startRoomEvents({ host, bus, setIntervalFn: () => 0, clearIntervalFn() {} });
	assert.equal(room.receiveLine(['c', ' a', 'hi']), 'orig');
	assert.deepEqual(lines, [['battle-1', ['c', ' a', 'hi']]]);
	notify();
	room.receiveLine(['c', ' a', 'again']);
	assert.equal(lines.length, 2, 'a repeat check must not double-wrap');
	stop();
	assert.equal(room.receiveLine, original);
});

test('room attachments create once, re-attach when the room element changes, and clean up', () => {
	const els = { 'battle-1': { id: 'e1', appended: [], appendChild(n) { n.parentNode = this; } } };
	const rooms = [{ id: 'battle-1' }];
	const host = { battleRooms: () => rooms, roomElement: r => els[r.id] || null };
	const log = [];
	const attachments = createRoomAttachments({
		host,
		create: () => (log.push('create'), { root: { parentNode: null } }),
		update: () => log.push('update'),
		destroy: () => log.push('destroy'),
	});
	attachments.sync();
	attachments.sync();
	assert.deepEqual(log, ['create', 'update', 'update']);
	const entry = attachments.entries.get('battle-1');
	assert.equal(entry.root.parentNode, els['battle-1']);
	els['battle-1'] = { id: 'e2', appendChild(n) { n.parentNode = this; } };
	attachments.sync();
	assert.equal(entry.root.parentNode.id, 'e2');
	delete els['battle-1'];
	attachments.sync();
	assert.equal(log.at(-1), 'destroy');
	assert.equal(attachments.entries.size, 0);
});
