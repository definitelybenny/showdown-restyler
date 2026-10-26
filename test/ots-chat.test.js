import test from 'node:test';
import assert from 'node:assert/strict';
import { teamSheets, monSummary } from '../src/core/ots.js';
import { parseChatLine, createChatLog, formatTime } from '../src/core/chat.js';

const mon = (species, extra = {}) => ({
	speciesForme: species, level: 50, gender: 'F', item: 'Leftovers', ability: 'Intimidate',
	moveTrack: [['Protect', 0], ['Tackle', 0]], nature: 'Adamant', teraType: 'Fire', ...extra,
});

test('monSummary flattens a pokemon and drops default level and neutral gender', () => {
	const s = monSummary(mon('Incineroar', { level: 100, gender: 'N' }));
	assert.deepEqual(s, {
		species: 'Incineroar', level: null, gender: '', item: 'Leftovers', ability: 'Intimidate',
		nature: 'Adamant', teraType: 'Fire', moves: ['Protect', 'Tackle'],
	});
});

test('teamSheets returns only sides with an open team sheet', () => {
	const battle = {
		sides: [
			{ sideid: 'p1', name: 'Ann', openTeamSheet: true, pokemon: [mon('Rillaboom')] },
			{ sideid: 'p2', name: 'Bob', pokemon: [mon('Hidden')] },
		],
	};
	const sheets = teamSheets(battle);
	assert.equal(sheets.length, 1);
	assert.equal(sheets[0].name, 'Ann');
	assert.equal(sheets[0].mons[0].species, 'Rillaboom');
});

test('teamSheets puts the opponent first for a player and tolerates missing data', () => {
	const side = (id, name) => ({ sideid: id, name, openTeamSheet: true, pokemon: [] });
	const battle = { sides: [side('p1', 'Ann'), side('p2', 'Bob')] };
	assert.deepEqual(teamSheets(battle, { ownSideId: 'p1' }).map(s => s.sideid), ['p2', 'p1']);
	assert.deepEqual(teamSheets(battle).map(s => s.sideid), ['p1', 'p2']);
	assert.deepEqual(teamSheets(null), []);
	assert.deepEqual(teamSheets({}), []);
});

test('parseChatLine handles c and c: and rejoins pipes in the message', () => {
	assert.deepEqual(parseChatLine(['c', '+Ann', 'a', 'b']), { time: 0, rank: '+', user: 'Ann', text: 'a|b', action: false });
	const timed = parseChatLine(['c:', '1700000000', ' Bob', 'gg']);
	assert.equal(timed.time, 1700000000);
	assert.equal(timed.user, 'Bob');
	assert.equal(timed.rank, '');
});

test('parseChatLine turns /me into an action and drops other commands and non-chat lines', () => {
	assert.deepEqual(parseChatLine(['c', ' Ann', '/me waves']), { time: 0, rank: '', user: 'Ann', text: 'waves', action: true });
	assert.equal(parseChatLine(['c', '~', '/raw <b>x</b>']), null);
	assert.equal(parseChatLine(['c', ' Ann', '']), null);
	assert.equal(parseChatLine(['move', 'p1a: X', 'Tackle']), null);
	assert.equal(parseChatLine(null), null);
});

test('createChatLog seeds from stepQueue strings, caps length and bumps revision', () => {
	const log = createChatLog(2);
	let notified = 0;
	log.subscribe(() => notified++);
	log.seed(['|move|p1a: X|Tackle|p2a: Y', '|c|+Ann|one', '|c:|1700000000| Bob|two', '|c|+Ann|three']);
	assert.deepEqual(log.messages().map(m => m.text), ['two', 'three']);
	assert.equal(notified, 1);
	const before = log.revision();
	log.add({ text: 'four' });
	assert.equal(log.revision(), before + 1);
	assert.equal(log.messages().length, 2);
});

test('formatTime formats unix seconds and hides a missing time', () => {
	const fixed = () => new Date(2024, 0, 1, 7, 5);
	assert.equal(formatTime(1, fixed), '07:05');
	assert.equal(formatTime(0), '');
});
