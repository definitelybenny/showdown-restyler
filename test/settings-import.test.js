import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettings, STORE_VERSION } from '../src/core/settings.js';

function make(initial = null) {
	let saved = initial;
	const events = [];
	const settings = createSettings({
		storage: { load: () => saved, save: text => { saved = text; } },
		emit: (e, p) => events.push([e, p]),
		warn: () => {},
	});
	return { settings, events, saved: () => saved };
}

test('export then import round-trips into a fresh store', () => {
	const a = make();
	a.settings.setModule('theme', { preset: 'midnight' });
	a.settings.setLayout({ leftWidth: 0.6, side: { pinned: 3 } });
	const b = make();
	b.settings.importJson(a.settings.exportJson());
	assert.equal(b.settings.module('theme').preset, 'midnight');
	assert.equal(b.settings.layout().leftWidth, 0.6);
	assert.equal(b.settings.layout().side.pinned, 3);
	assert.ok(JSON.parse(b.saved()));
});

test('import rejects bad input and keeps the current state', () => {
	const { settings } = make();
	settings.setModule('theme', { preset: 'dark' });
	for (const bad of ['not json', '[]', '"x"', '{}', JSON.stringify({ version: STORE_VERSION + 1 }), JSON.stringify({ version: 0 })]) {
		assert.throws(() => settings.importJson(bad), undefined, bad);
	}
	assert.equal(settings.module('theme').preset, 'dark');
});

test('import fills missing layout fields from defaults and emits changes for every module', () => {
	const { settings, events } = make();
	settings.setModule('old', { enabled: false });
	events.length = 0;
	settings.importJson(JSON.stringify({ version: STORE_VERSION, modules: { theme: { enabled: false } }, layout: { leftWidth: 0.5 } }));
	assert.equal(settings.layout().battle.maxScale, 2);
	assert.equal(settings.module('old').enabled, undefined);
	const changed = events.filter(([e]) => e === 'settings:change').map(([, p]) => p.module).sort();
	assert.deepEqual(changed, ['old', 'theme']);
	assert.ok(events.some(([e]) => e === 'layout:change'));
});

test('a non-integer version is rejected', () => {
	const { settings } = make();
	assert.throws(() => settings.importJson(JSON.stringify({ version: 1.5 })), /version/);
});

test('reset returns to defaults', () => {
	const { settings } = make();
	settings.setModule('theme', { preset: 'dark' });
	settings.setLayout({ leftWidth: 0.7 });
	settings.reset();
	assert.deepEqual(settings.module('theme'), {});
	assert.equal(settings.layout().leftWidth, null);
});
