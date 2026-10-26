/**
 * Open team sheets from a client `Battle`. `|showteam|` fills `battle.sides[n].pokemon` and sets
 * `side.openTeamSheet`; the pokemon carry `speciesForme`, `item`, `ability`, `moveTrack` ([name, pp][]),
 * `nature`, `teraType` and `level`. Pure: no DOM, no client globals.
 */
export function monSummary(pokemon, moveName = name => name) {
	return {
		species: pokemon.speciesForme || pokemon.name || '?',
		level: pokemon.level && pokemon.level !== 100 ? pokemon.level : null,
		gender: pokemon.gender && pokemon.gender !== 'N' ? pokemon.gender : '',
		item: pokemon.item || '',
		ability: pokemon.ability || pokemon.baseAbility || '',
		nature: pokemon.nature || '',
		teraType: pokemon.teraType || '',
		moves: (pokemon.moveTrack || []).map(entry => moveName(Array.isArray(entry) ? entry[0] : entry)).filter(Boolean),
	};
}

/**
 * One entry per side that has an open team sheet. When `ownSideId` is given (a player, not a spectator)
 * the other side comes first, since the opponent's sheet is the one worth looking at.
 */
export function teamSheets(battle, { ownSideId = null, moveName } = {}) {
	if (!battle || !Array.isArray(battle.sides)) return [];
	const sheets = [];
	const seen = new Set();
	for (const side of battle.sides) {
		if (!side || seen.has(side) || !side.openTeamSheet) continue;
		seen.add(side);
		sheets.push({
			sideid: side.sideid || '',
			name: side.name || side.sideid || 'Player',
			mons: (side.pokemon || []).map(p => monSummary(p, moveName)),
		});
	}
	if (ownSideId) sheets.sort((a, b) => (a.sideid === ownSideId) - (b.sideid === ownSideId));
	return sheets;
}
