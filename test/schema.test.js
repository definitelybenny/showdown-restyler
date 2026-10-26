import test from 'node:test';
import assert from 'node:assert/strict';
import { describeControls, coerceValue } from '../src/core/schema.js';

test('control types come from default values and skip enabled and objects', () => {
	const controls = describeControls({ enabled: true, on: false, n: 3, name: 'x', accent: '#7c8cff', nested: {} });
	assert.deepEqual(controls.map(c => [c.key, c.type]), [['on', 'toggle'], ['n', 'number'], ['name', 'text'], ['accent', 'color']]);
});

test('schema hints supply labels, numeric bounds and select options', () => {
	const [mode, scale] = describeControls(
		{ mode: 'auto', maxScale: 2 },
		{ mode: { options: ['auto', { value: 'px', label: 'Pixelated' }] }, maxScale: { min: 1, max: 4, step: 0.5, label: 'Cap' } }
	);
	assert.equal(mode.type, 'select');
	assert.deepEqual(mode.options, [{ value: 'auto', label: 'auto' }, { value: 'px', label: 'Pixelated' }]);
	assert.equal(mode.label, 'Mode');
	assert.deepEqual([scale.label, scale.min, scale.max, scale.step], ['Cap', 1, 4, 0.5]);
});

test('labels are humanized from camelCase keys', () => {
	assert.equal(describeControls({ spriteRendering: 'a' })[0].label, 'Sprite rendering');
});

test('coerceValue clamps numbers and rejects junk', () => {
	const num = { type: 'number', min: 1, max: 4 };
	assert.deepEqual(coerceValue(num, '9'), { ok: true, value: 4 });
	assert.deepEqual(coerceValue(num, '0'), { ok: true, value: 1 });
	assert.equal(coerceValue(num, 'abc').ok, false);
	assert.equal(coerceValue(num, '').ok, false);
});

test('coerceValue validates selects and colours', () => {
	const sel = { type: 'select', options: [{ value: 1, label: 'one' }, { value: 'b', label: 'b' }] };
	assert.deepEqual(coerceValue(sel, '1'), { ok: true, value: 1 });
	assert.equal(coerceValue(sel, 'zzz').ok, false);
	assert.deepEqual(coerceValue({ type: 'color' }, '#ABCDEF'), { ok: true, value: '#abcdef' });
	assert.equal(coerceValue({ type: 'color' }, 'red').ok, false);
	assert.equal(coerceValue({ type: 'toggle' }, true).value, true);
});
