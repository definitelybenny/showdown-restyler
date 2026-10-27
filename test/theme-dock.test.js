import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme, inkFor, tokensCss, THEME_NAMES } from '../src/core/theme.js';
import { dockRect } from '../src/core/layout.js';
import { clampChatHeight } from '../src/modules/log-chat-split.js';
import { resolveActive, lowestEdge } from '../src/modules/battle-dock.js';
import { spriteCss } from '../src/modules/battle-scale.js';

test('named presets set the client dark state, auto follows it', () => {
	assert.equal(resolveTheme({ preset: 'dark' }).dark, true);
	assert.equal(resolveTheme({ preset: 'light' }).dark, false);
	assert.equal(resolveTheme({ preset: 'midnight' }).dark, true);
	const auto = resolveTheme({ preset: 'auto' }, true);
	assert.equal(auto.dark, null);
	assert.equal(auto.tokens['--rs-bg'], resolveTheme({ preset: 'dark' }).tokens['--rs-bg']);
	assert.equal(resolveTheme({ preset: 'auto' }, false).tokens['--rs-bg'], resolveTheme({ preset: 'light' }).tokens['--rs-bg']);
	assert.ok(THEME_NAMES.includes('auto'));
});

test('a valid custom accent wins and gets a readable ink; junk is ignored', () => {
	const custom = resolveTheme({ preset: 'dark', accent: '#F59E0B' });
	assert.equal(custom.tokens['--rs-accent'], '#f59e0b');
	assert.equal(custom.tokens['--rs-accent-ink'], '#0b0d14');
	assert.equal(resolveTheme({ preset: 'dark', accent: 'red' }).tokens['--rs-accent'], '#7c8cff');
	assert.equal(inkFor('#000000'), '#ffffff');
	assert.equal(inkFor('#ffffff'), '#0b0d14');
});

test('the font setting cannot break out of the css declaration', () => {
	const { tokens } = resolveTheme({ preset: 'dark', font: 'Inter; } body{display:none' });
	assert.ok(!/[;{}]/.test(tokens['--rs-font']));
	assert.ok(tokenFallback(resolveTheme({ preset: 'dark', font: '' }).tokens['--rs-font']));
	assert.match(tokensCss({ '--a': '1', '--b': '2' }, 'html'), /^html\{--a:1;--b:2\}$/);
});

function tokenFallback(font) {
	return font.includes('system-ui');
}

test('dockRect sits under the controls, same width, to the bottom of the room', () => {
	const room = { top: 0, left: 0, width: 1000, height: 700 };
	assert.deepEqual(
		dockRect({ top: 400, left: 0, width: 780, height: 150 }, room),
		{ top: 556, left: 0, width: 780, height: 144 }
	);
});

test('dockRect returns null when there is too little room or no controls', () => {
	const room = { top: 0, left: 0, width: 1000, height: 700 };
	assert.equal(dockRect({ top: 400, left: 0, width: 780, height: 250 }, room), null);
	assert.equal(dockRect({ top: 400, left: 0, width: 0, height: 100 }, room), null);
	assert.notEqual(dockRect({ top: 400, left: 0, width: 780, height: 250 }, room, { minHeight: 20 }), null);
});

test('clampChatHeight keeps the chat and the log usable', () => {
	assert.equal(clampChatHeight(10, 600), 80);
	assert.equal(clampChatHeight(900, 600), 480);
	assert.equal(clampChatHeight('abc', 600), 80);
	assert.equal(clampChatHeight(200, 150), 80);
});

test('resolveActive prefers the saved panel, else the first, else null', () => {
	assert.equal(resolveActive(['a', 'b'], 'b'), 'b');
	assert.equal(resolveActive(['a', 'b'], 'zzz'), 'a');
	assert.equal(resolveActive([], 'a'), null);
});

test('spriteCss only emits for the non-default modes', () => {
	assert.equal(spriteCss('auto'), '');
	assert.equal(spriteCss('bogus'), '');
	assert.match(spriteCss('pixelated'), /image-rendering:pixelated!important/);
	assert.match(spriteCss('crisp-edges'), /crisp-edges/);
});

test('lowestEdge keeps overflowing move and switch menus uncovered', () => {
	assert.equal(lowestEdge([], 300), 300);
	assert.equal(lowestEdge([{ width: 50, height: 20, bottom: 520 }], 300), 520);
	assert.equal(lowestEdge([{ width: 0, height: 20, bottom: 900 }, { width: 50, height: 0, bottom: 900 }], 300), 300);
});

test('dockRect never starts above the lowest control, even with a saved height', () => {
	const room = { top: 0, left: 0, width: 1000, height: 700 };
	const r = dockRect({ top: 400, left: 0, width: 780, height: 120 }, room, { maxHeight: 600 });
	assert.ok(r.top >= 400 + 120);
});
