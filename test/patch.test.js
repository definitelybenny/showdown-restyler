import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatcher } from '../src/core/patch.js';

test('wraps the current value and keeps `this`', () => {
	const obj = { n: 2, f(x) { return x * this.n; } };
	const { patch } = createPatcher();
	patch(obj, 'f', function (prev, x) { return prev.call(this, x) + 1; });
	assert.equal(obj.f(5), 11);
});

test('undo restores the previous function', () => {
	const f = () => 1;
	const obj = { f };
	const { patch } = createPatcher();
	const undo = patch(obj, 'f', prev => prev() + 1);
	assert.equal(obj.f(), 2);
	undo();
	assert.equal(obj.f, f);
});

test('undo of an inherited method removes the own property', () => {
	class A { f() { return 1; } }
	const a = new A();
	const { patch, undoAll } = createPatcher();
	patch(a, 'f', prev => prev() + 1);
	undoAll();
	assert.equal(Object.prototype.hasOwnProperty.call(a, 'f'), false);
	assert.equal(a.f(), 1);
});

test('undo does not clobber a wrapper installed on top; ours becomes pass-through', () => {
	const obj = { f: () => 1 };
	const { patch } = createPatcher();
	const undo = patch(obj, 'f', prev => prev() + 10);
	const ours = obj.f;
	const other = createPatcher();
	other.patch(obj, 'f', prev => prev() + 100);
	const top = obj.f;
	undo();
	assert.equal(obj.f, top);
	assert.equal(obj.f(), 101);
	assert.notEqual(ours, top);
});

test('undoAll unwinds in reverse order', () => {
	const f = () => 1;
	const obj = { f };
	const { patch, undoAll } = createPatcher();
	patch(obj, 'f', prev => prev() + 1);
	patch(obj, 'f', prev => prev() * 10);
	assert.equal(obj.f(), 20);
	undoAll();
	assert.equal(obj.f, f);
});

test('rejects non-functions', () => {
	assert.throws(() => createPatcher().patch({ x: 1 }, 'x', p => p), TypeError);
});
