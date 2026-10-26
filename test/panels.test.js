import test from 'node:test';
import assert from 'node:assert/strict';
import { createPanelRegistry } from '../src/core/panels.js';
import { createBus } from '../src/core/events.js';
import { createApi, API_VERSION } from '../src/core/api.js';

function setup() {
	const bus = createBus();
	const events = [];
	const emit = (e, p) => {
		events.push(e);
		bus.emit(e, p);
	};
	const errors = [];
	const panels = createPanelRegistry({ bus, emit, onError: e => errors.push(e) });
	return { bus, panels, events, errors };
}

test('register validates id, render and hosts', () => {
	const { panels } = setup();
	assert.throws(() => panels.register({ id: 'Bad Id', render() {} }), /id must match/);
	assert.throws(() => panels.register({ id: 'ok' }), /render/);
	assert.throws(() => panels.register({ id: 'ok', render() {}, hosts: ['nowhere'] }), /hosts/);
	panels.register({ id: 'ok', render() {} });
	assert.throws(() => panels.register({ id: 'ok', render() {} }), /already registered/);
});

test('list filters by host and unregister removes and emits', () => {
	const { panels, events } = setup();
	const off = panels.register({ id: 'a', render() {}, hosts: ['dock'] });
	panels.register({ id: 'b', render() {}, hosts: ['side'] });
	assert.deepEqual(panels.list('dock').map(p => p.id), ['a']);
	assert.equal(panels.list().length, 2);
	off();
	off();
	assert.deepEqual(panels.list().map(p => p.id), ['b']);
	assert.deepEqual(events, ['panel:register', 'panel:register', 'panel:unregister']);
});

test('mount runs cleanup once, also when the panel is unregistered', () => {
	const { panels } = setup();
	let cleaned = 0;
	const off = panels.register({ id: 'a', render: () => () => cleaned++ });
	const mounted = panels.mount('a', {}, {});
	mounted.unmount();
	mounted.unmount();
	assert.equal(cleaned, 1);
	panels.mount('a', {}, {});
	off();
	assert.equal(cleaned, 2);
});

test('a throwing render is reported, not rethrown, and leaves nothing mounted', () => {
	const { panels, errors } = setup();
	panels.register({ id: 'a', render() { throw new Error('boom'); } });
	assert.equal(panels.mount('a', {}, {}), null);
	assert.equal(errors.length, 1);
	assert.equal(panels.mount('missing', {}, {}), null);
});

test('ctx.subscribe follows room events until unmount', () => {
	const { panels, bus } = setup();
	let calls = 0;
	panels.register({ id: 'a', render: (el, ctx) => void ctx.subscribe(() => calls++) });
	const mounted = panels.mount('a', {}, {});
	bus.emit('battle:line', {});
	mounted.unmount();
	bus.emit('battle:line', {});
	assert.equal(calls, 1);
});

test('public api exposes version, registerPanel and on', () => {
	const { panels, bus } = setup();
	const api = createApi({ bus, panels, registry: { list: () => ['x'], isEnabled: () => true, setEnabled() {} } });
	assert.equal(api.version, API_VERSION);
	const seen = [];
	api.on('thing', v => seen.push(v));
	bus.emit('thing', 1);
	assert.deepEqual(seen, [1]);
	const off = api.registerPanel({ id: 'mrh', title: 'MRH', render() {} });
	assert.equal(panels.has('mrh'), true);
	off();
	assert.equal(panels.has('mrh'), false);
	assert.equal(Object.isFrozen(api), true);
});
