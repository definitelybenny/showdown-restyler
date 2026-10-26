import { CLIENT, fitBattle } from '../core/layout.js';

export const SPRITE_RENDERING = ['auto', 'pixelated', 'crisp-edges'];

/** CSS for the sprite scaling option; empty for 'auto' (the browser's default smoothing). */
export function spriteCss(mode) {
	if (mode !== 'pixelated' && mode !== 'crisp-edges') return '';
	return `.battle img{image-rendering:${mode}!important}`;
}

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
	defaults: { spriteRendering: 'auto' },
	schema: {
		spriteRendering: {
			label: 'Sprite scaling',
			help: 'How sprites are drawn when the field is scaled past 1x. Pixelated keeps pixel art sharp.',
			options: SPRITE_RENDERING,
		},
	},

	css: settings => spriteCss(settings.spriteRendering),

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
