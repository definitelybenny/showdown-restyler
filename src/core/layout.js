/**
 * Pure layout math: no DOM, no client globals. The host adapters feed the results to the
 * patched client functions. Constants mirror the Preact client at smogon/pokemon-showdown-client@f49fca9
 * (PS.chooseBattleLayout, PS.calculateLeftPanelWidth, PS.roomLayoutBreakpointPassed).
 */
export const CLIENT = Object.freeze({
	topbar: 56,
	fieldW: 640,
	fieldH: 360,
	/** Battle rooms are 'side-by-side' only above this width (also the `tiny-layout` breakpoint). */
	sideBySideAbove: 780,
	// Stock field (640) plus a log column that stays readable; below this the stock width is kept.
	battleMinLeft: 940,
	/** The client's own reserve beside / below the field; the log and controls need it. */
	logReserve: 180,
	controlsReserve: 180,
	/** Below these viewport sizes the client switches to vertical tabs. */
	verticalBelowWidth: 700,
	verticalBelowHeight: 430,
	minRight: 320,
	maxPinned: 8,
});

export function defaultLayout() {
	return {
		version: 1,
		leftWidth: null, // null = stock; <= 1 is a ratio of the viewport width, > 1 is px
		battle: {
			fieldScale: 'fit', // 'fit' or a fixed number
			maxScale: 2,
			logMin: 300, // px kept free beside the field for the log (never below the client's 180)
		},
		side: { pinned: 1, split: 'vertical', sizes: null },
		presets: { active: null },
	};
}

export const PRESETS = Object.freeze({
	wide: {
		leftWidth: 0.62,
		battle: { fieldScale: 'fit', maxScale: 2, logMin: 300 },
		side: { pinned: 1, split: 'vertical', sizes: null },
	},
	focus: {
		leftWidth: 0.8,
		battle: { fieldScale: 'fit', maxScale: 3, logMin: 260 },
		side: { pinned: 1, split: 'vertical', sizes: null },
	},
	stream: {
		leftWidth: 0.7,
		battle: { fieldScale: 'fit', maxScale: 2, logMin: 420 },
		side: { pinned: 2, split: 'vertical', sizes: [0.6, 0.4] },
	},
});

/** Returns a full layout for a preset name, or null if unknown. */
export function presetLayout(name) {
	const preset = PRESETS[name];
	if (!preset) return null;
	const base = defaultLayout();
	return {
		...base,
		leftWidth: preset.leftWidth,
		battle: { ...base.battle, ...preset.battle },
		side: { ...base.side, ...preset.side, sizes: preset.side.sizes ? [...preset.side.sizes] : null },
		presets: { active: name },
	};
}

/** True when the viewport is small enough that the client uses vertical tabs (we pass through). */
export function isTinyViewport(viewport) {
	return viewport.width < CLIENT.verticalBelowWidth || viewport.height < CLIENT.verticalBelowHeight;
}

/**
 * Left panel width in px, or null if the constraints cannot be met (caller keeps the stock width).
 * @param value  null | ratio (<= 1) | px (> 1)
 * @param limits { minLeft, minRight }; the left room may not drop below minLeft (e.g. 781 for a
 *               battle, to avoid `tiny-layout`) and the right panel may not drop below minRight.
 */
export function resolveLeftWidth(value, viewportWidth, limits = {}) {
	if (value == null || !Number.isFinite(value) || value <= 0) return null;
	const minLeft = limits.minLeft ?? CLIENT.sideBySideAbove + 1;
	const minRight = limits.minRight ?? CLIENT.minRight;
	// The right room starts at left + 1 and ends at the viewport edge.
	const maxLeft = viewportWidth - 1 - minRight;
	if (maxLeft < minLeft) return null;
	const px = value <= 1 ? Math.round(value * viewportWidth) : Math.round(value);
	return Math.min(maxLeft, Math.max(minLeft, px));
}

/**
 * Largest field scale for a battle room of `area` px. Mirrors the client's constraints but allows
 * scale > 1. Returns null when the room is not side-by-side (caller keeps the stock layout).
 * @param opts.minScale never go below this (the stock scale)
 * @returns {{scale, battleW, battleH} | null}
 */
export function fitBattle(battle, area, opts = {}) {
	if (area.width <= CLIENT.sideBySideAbove) return null;
	const maxScale = battle.maxScale ?? 2;
	const logReserve = Math.max(CLIENT.logReserve, battle.logMin ?? CLIENT.logReserve);
	const bound = Math.min(
		maxScale,
		(area.width - logReserve) / CLIENT.fieldW,
		(area.height - CLIENT.controlsReserve) / CLIENT.fieldH
	);
	let scale = typeof battle.fieldScale === 'number' ? Math.min(battle.fieldScale, bound) : bound;
	scale = Math.max(scale, opts.minScale ?? 0, 0);
	return {
		scale,
		battleW: Math.round(CLIENT.fieldW * scale),
		battleH: Math.round(CLIENT.fieldH * scale),
	};
}

function normalizedSizes(sizes, n) {
	if (!Array.isArray(sizes) || sizes.length !== n || sizes.some(s => !(s > 0))) {
		return new Array(n).fill(1 / n);
	}
	const total = sizes.reduce((a, b) => a + b, 0);
	return sizes.map(s => s / total);
}

/**
 * Splits `rect` ({top, left, width, height}) into `side.pinned` slots. Edges are rounded
 * cumulatively so the slots tile the rect exactly with no gaps.
 * 'vertical' stacks slots top to bottom; 'horizontal' places them side by side.
 */
export function sideSlots(side, rect) {
	const n = Math.max(1, Math.min(CLIENT.maxPinned, Math.floor(side.pinned) || 1));
	const sizes = normalizedSizes(side.sizes, n);
	const horizontal = side.split === 'horizontal';
	const total = horizontal ? rect.width : rect.height;
	const slots = [];
	let acc = 0;
	let start = 0;
	for (let i = 0; i < n; i++) {
		acc += sizes[i];
		const end = i === n - 1 ? total : Math.round(total * acc);
		const length = end - start;
		slots.push(
			horizontal ?
				{ top: rect.top, left: rect.left + start, width: length, height: rect.height } :
				{ top: rect.top + start, left: rect.left, width: rect.width, height: length }
		);
		start = end;
	}
	return slots;
}

/**
 * (layout, viewport) -> concrete numbers.
 * @param viewport {width, height} of document.documentElement
 * @param opts { minLeft, minRight, stockLeftWidth, minScale }
 * @returns {{passthrough, leftWidth, battleW, battleH, sideSlots}}; with `passthrough: true`
 *   everything else is null/empty and the client's own numbers must be used.
 */
export function computeLayout(layout, viewport, opts = {}) {
	const none = { passthrough: true, leftWidth: null, battleW: null, battleH: null, sideSlots: [] };
	if (isTinyViewport(viewport)) return none;
	const leftWidth = resolveLeftWidth(layout.leftWidth, viewport.width, opts) ?? opts.stockLeftWidth ?? null;
	if (!leftWidth) return none;

	const roomHeight = viewport.height - CLIENT.topbar;
	const field = fitBattle(layout.battle, { width: leftWidth, height: roomHeight }, opts);
	const rect = {
		top: CLIENT.topbar,
		left: leftWidth + 1,
		// Right room starts 1px after the divider and ends at the viewport edge.
		width: viewport.width - leftWidth - 1,
		height: roomHeight,
	};
	return {
		passthrough: false,
		leftWidth,
		battleW: field ? field.battleW : null,
		battleH: field ? field.battleH : null,
		sideSlots: sideSlots(layout.side, rect),
	};
}

/**
 * Where the dock goes: directly under the controls, same width, down to the bottom of the room.
 * Both rects are in the same coordinate space ({top, left, width, height}). Null when too little
 * height is left to be useful.
 */
export function dockRect(controls, room, { gap = 6, minHeight = 80 } = {}) {
	const top = Math.round(controls.top + controls.height + gap);
	const height = Math.round(room.top + room.height - top);
	if (!(controls.width > 0) || height < minHeight) return null;
	return { top, left: Math.round(controls.left), width: Math.round(controls.width), height };
}
