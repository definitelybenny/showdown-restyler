import test from 'node:test';
import assert from 'node:assert/strict';
import {
	CLIENT, PRESETS, computeLayout, defaultLayout, fitBattle, isTinyViewport, presetLayout,
	resolveLeftWidth, sideSlots,
} from '../src/core/layout.js';

const HD = { width: 1920, height: 1080 };

test('resolveLeftWidth: null/invalid means stock', () => {
	assert.equal(resolveLeftWidth(null, 1920), null);
	assert.equal(resolveLeftWidth(0, 1920), null);
	assert.equal(resolveLeftWidth(NaN, 1920), null);
});

test('resolveLeftWidth: ratio vs px', () => {
	assert.equal(resolveLeftWidth(0.5, 1920), 960);
	assert.equal(resolveLeftWidth(1, 1920), 1920 - 1 - CLIENT.minRight);
	assert.equal(resolveLeftWidth(1000, 1920), 1000);
});

test('resolveLeftWidth: clamps to avoid battle tiny-layout and a squashed right panel', () => {
	assert.equal(resolveLeftWidth(0.1, 1920), 781);
	assert.equal(resolveLeftWidth(0.99, 1920), 1920 - 1 - 320);
	assert.equal(resolveLeftWidth(0.1, 1920, { minLeft: 340 }), 340);
	assert.equal(resolveLeftWidth(0.99, 1920, { minRight: 600 }), 1319);
});

test('resolveLeftWidth: impossible constraints fall back to stock', () => {
	assert.equal(resolveLeftWidth(0.5, 1000, { minLeft: 781, minRight: 320 }), null);
});

test('fitBattle: capped by maxScale', () => {
	const f = fitBattle({ fieldScale: 'fit', maxScale: 1.5, logMin: 300 }, { width: 1500, height: 1000 });
	assert.equal(f.scale, 1.5);
	assert.equal(f.battleW, 960);
	assert.equal(f.battleH, 540);
});

test('fitBattle: capped by width minus log reserve', () => {
	const f = fitBattle({ fieldScale: 'fit', maxScale: 5, logMin: 300 }, { width: 1240, height: 2000 });
	assert.equal(f.scale, (1240 - 300) / 640);
});

test('fitBattle: capped by height minus controls reserve', () => {
	const f = fitBattle({ fieldScale: 'fit', maxScale: 5, logMin: 300 }, { width: 3000, height: 900 });
	assert.equal(f.scale, (900 - CLIENT.controlsReserve) / 360);
	assert.equal(f.battleH, 720);
});

test('fitBattle: log reserve never drops below the client 180px', () => {
	const f = fitBattle({ fieldScale: 'fit', maxScale: 5, logMin: 10 }, { width: 820 + 180, height: 5000 });
	assert.equal(f.scale, 820 / 640);
});

test('fitBattle: fixed scale is still bounded by the room', () => {
	const big = fitBattle({ fieldScale: 4, maxScale: 5, logMin: 300 }, { width: 1240, height: 1080 });
	assert.equal(big.scale, (1240 - 300) / 640);
	const small = fitBattle({ fieldScale: 1.2, maxScale: 5, logMin: 300 }, { width: 1900, height: 1080 });
	assert.equal(small.scale, 1.2);
});

test('fitBattle: never below minScale (stock)', () => {
	const f = fitBattle({ fieldScale: 'fit', maxScale: 2, logMin: 300 }, { width: 900, height: 500 }, { minScale: 1 });
	assert.equal(f.scale, 1);
});

test('fitBattle: width and height come from one scale', () => {
	const f = fitBattle(defaultLayout().battle, { width: 1111, height: 777 });
	assert.equal(f.battleW, Math.round(640 * f.scale));
	assert.equal(f.battleH, Math.round(360 * f.scale));
});

test('fitBattle: not side-by-side at or below the tiny breakpoint', () => {
	assert.equal(fitBattle(defaultLayout().battle, { width: 780, height: 1000 }), null);
	assert.notEqual(fitBattle(defaultLayout().battle, { width: 781, height: 1000 }), null);
});

test('sideSlots: pinned 1 is the whole rect', () => {
	const rect = { top: 56, left: 1200, width: 721, height: 1024 };
	assert.deepEqual(sideSlots({ pinned: 1 }, rect), [rect]);
});

test('sideSlots: vertical stack tiles the rect exactly', () => {
	const rect = { top: 56, left: 1200, width: 721, height: 1025 };
	const slots = sideSlots({ pinned: 3, split: 'vertical', sizes: null }, rect);
	assert.equal(slots.length, 3);
	assert.equal(slots[0].top, 56);
	for (let i = 1; i < slots.length; i++) assert.equal(slots[i].top, slots[i - 1].top + slots[i - 1].height);
	assert.equal(slots.reduce((a, s) => a + s.height, 0), rect.height);
	assert.ok(slots.every(s => s.left === 1200 && s.width === 721));
});

test('sideSlots: horizontal columns with weights', () => {
	const rect = { top: 56, left: 1000, width: 900, height: 900 };
	const slots = sideSlots({ pinned: 2, split: 'horizontal', sizes: [1, 2] }, rect);
	assert.deepEqual(slots.map(s => s.width), [300, 600]);
	assert.equal(slots[1].left, 1300);
	assert.ok(slots.every(s => s.top === 56 && s.height === 900));
});

test('sideSlots: bad sizes fall back to equal split; pinned is clamped', () => {
	const rect = { top: 0, left: 0, width: 100, height: 100 };
	assert.deepEqual(sideSlots({ pinned: 2, sizes: [1] }, rect).map(s => s.height), [50, 50]);
	assert.deepEqual(sideSlots({ pinned: 2, sizes: [1, 0] }, rect).map(s => s.height), [50, 50]);
	assert.equal(sideSlots({ pinned: 99 }, rect).length, CLIENT.maxPinned);
	assert.equal(sideSlots({ pinned: 0 }, rect).length, 1);
});

test('isTinyViewport matches the client vertical-tab thresholds', () => {
	assert.equal(isTinyViewport({ width: 699, height: 1000 }), true);
	assert.equal(isTinyViewport({ width: 1000, height: 429 }), true);
	assert.equal(isTinyViewport({ width: 700, height: 430 }), false);
});

test('computeLayout: tiny viewport passes through', () => {
	const r = computeLayout(presetLayout('wide'), { width: 600, height: 900 });
	assert.equal(r.passthrough, true);
	assert.equal(r.leftWidth, null);
	assert.deepEqual(r.sideSlots, []);
});

test('computeLayout: default layout without a stock width passes through', () => {
	assert.equal(computeLayout(defaultLayout(), HD).passthrough, true);
});

test('computeLayout: stock width is used when none is set', () => {
	const r = computeLayout(defaultLayout(), HD, { stockLeftWidth: 1256 });
	assert.equal(r.leftWidth, 1256);
	assert.equal(r.battleW, Math.round(640 * Math.min(2, (1256 - 300) / 640, (1024 - 180) / 360)));
});

test('computeLayout: wide preset at 1920x1080', () => {
	const r = computeLayout(presetLayout('wide'), HD);
	assert.equal(r.leftWidth, Math.round(0.62 * 1920));
	const scale = Math.min(2, (r.leftWidth - 300) / 640, (1080 - 56 - 180) / 360);
	assert.equal(r.battleW, Math.round(640 * scale));
	assert.equal(r.battleH, Math.round(360 * scale));
	assert.equal(r.sideSlots.length, 1);
	assert.deepEqual(r.sideSlots[0], { top: 56, left: r.leftWidth + 1, width: 1920 - r.leftWidth - 1, height: 1024 });
});

test('computeLayout: left and right sit flush with no gap', () => {
	const r = computeLayout(presetLayout('stream'), HD);
	const [a, b] = r.sideSlots;
	assert.equal(r.sideSlots.length, 2);
	assert.equal(a.left + a.width, HD.width);
	assert.equal(b.top, a.top + a.height);
	assert.equal(b.top + b.height, HD.height);
});

test('computeLayout: narrow left room has no field scaling', () => {
	const r = computeLayout({ ...defaultLayout(), leftWidth: 700 }, HD, { minLeft: 340 });
	assert.equal(r.leftWidth, 700);
	assert.equal(r.battleW, null);
});

test('computeLayout: left width never leaves the right panel below its minimum', () => {
	const r = computeLayout({ ...defaultLayout(), leftWidth: 0.99 }, HD);
	assert.ok(r.sideSlots[0].width >= CLIENT.minRight);
});

test('presets: all defined and ordered by how much room the field gets', () => {
	assert.deepEqual(Object.keys(PRESETS).sort(), ['focus', 'stream', 'wide']);
	const field = name => computeLayout(presetLayout(name), HD).battleH;
	assert.ok(field('focus') >= field('wide'));
	for (const name of Object.keys(PRESETS)) {
		const layout = presetLayout(name);
		assert.equal(layout.presets.active, name);
		assert.equal(layout.version, 1);
		const r = computeLayout(layout, HD);
		assert.equal(r.passthrough, false);
		assert.ok(r.leftWidth > CLIENT.sideBySideAbove);
	}
	assert.equal(presetLayout('nope'), null);
});

test('presetLayout returns independent objects', () => {
	const a = presetLayout('stream');
	a.side.sizes.push(1);
	assert.deepEqual(presetLayout('stream').side.sizes, [0.6, 0.4]);
});
