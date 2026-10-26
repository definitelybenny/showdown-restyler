import { CLIENT, fitBattle } from '../core/layout.js';

/**
 * Lets the battle field grow past 640x360. Wraps PS.chooseBattleLayout, which the client calls with
 * the old and new room size on every layout pass, so the wrapper is pure: no DOM reads, no side effects.
 * The client then scales the frame and moves the controls and log around the numbers we return.
 */
export default {
	id: 'battle-scale',
	name: 'Battle field scale',
	clients: ['preact'],
	requires: ['core-layout'],
	defaults: {},

	setup(ctx) {
		ctx.patch(...ctx.host.layoutHooks.chooseBattleLayout, function (prev, width, height, preference, ...rest) {
			const stock = prev.call(this, width, height, preference, ...rest);
			// Overlay variants draw the controls over the field, so the reserve below it would be wrong.
			if (stock.layout !== 'side-by-side' || preference?.endsWith('-overlay')) return stock;

			const field = fitBattle(ctx.layout.get().battle, { width, height }, {
				minScale: stock.battleHeight / CLIENT.fieldH,
			});
			if (!field || field.battleH <= stock.battleHeight) return stock;
			// fitBattle keeps 180px below the field, which is exactly when the client stops overlaying the controls.
			return { ...stock, battleWidth: field.battleW, battleHeight: field.battleH, overlayControls: false };
		});
	},
};
