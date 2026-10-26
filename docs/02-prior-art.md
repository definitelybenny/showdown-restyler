# Prior art

Researched on 2026-10-26. "Unverified" means we found the project but did not read its code.

## Tools

| Name | Type | How it hooks in | Maintained | Relevance |
|---|---|---|---|---|
| [Showdex](https://github.com/doshidak/showdex) (Hellodex/Calcdex/Honkdex/Notedex) | MV3 extension, AGPL | Injects page-context `main.js`. Detects the client into `window.__SHOWDEX_HOST` (`'preact'`/`'classic'`). Preact: `PS.addRoomType`, wraps PS functions. Classic: HTML rooms plus wrapped `app.*` | Yes (v1.4.2, 2026-09) | **Must stay compatible**; the user runs it |
| [Pokémon Showdown Pro](https://github.com/Ryukotsuki/PokemonShowdownPro) ([thread](https://www.smogon.com/forums/threads/pok%C3%A9mon-showdown-pro.3789235/)) | Electron app, AGPL | Loads the real client and injects CSS/JS. **Theater mode** tags native nodes with `data-pro-theater-part="battle/log/controls/chat-input/users"` and re-lays them out with CSS. It re-anchors after re-renders and has collapsible, resizable panels | Yes (v1.2.0, 2026-10) | **Closest prior art** for layout. Coexists with Showdex |
| [Showdown Battle UI Overhaul](https://github.com/reachforaryan/pokemon-showdown-visual-extension) | Chrome extension | CSS, a MutationObserver and resize handlers. 75/25 battle/chat split, scaled canvas, 2x2 move grid | 2026-07 | Small, same "bigger battle" goal |
| [Showdown Randbats](https://greasyfork.org/en/scripts/526823-showdown-randbats) | Userscript | `@grant none`; wraps `BattleTooltips.prototype.showPokemonTooltip` | Yes | Pattern for tooltip plugins |
| [Enhanced Tooltips (fork)](https://github.com/generiskk/Pokemon-Showdown-Enhanced-Tooltips) | Extension | Tooltip augmentation (unverified) | Fork active | Candidate future module |
| [Three Island](https://github.com/PartMan7/Three-Island) | Extension + userscript | PokéPaste integration (unverified) | 2026-09 | Compatibility |
| [pizzacatz/showdown-scripts](https://github.com/pizzacatz/showdown-scripts) | Userscripts | DOM QoL. Has `docs/showdown-dom-notes.md` (not read) | 2026-09 | Possibly useful selector notes |
| [Teambuilder-Beautify](https://github.com/FullLifeGames/Teambuilder-Beautify) / Teamsheet Graphic | Userscript / extension | Team sheet overlay | 2026-06 | Ideas for the OTS panel |
| Userstyles: SwSh Layout, Old Gen Theme, Showdown Pro v4.03, Neon ([userstyles.world](https://userstyles.world/search?q=showdown)) | Stylus CSS | Pure CSS | ~2024 | Theme reference. Likely classic markup only |
| [Mock Regional Helper](https://github.com/definitelybenny/mock-regional-helper) (ours) | Userscript | Page-context hook via CustomEvents. `PS.addRoomType` / `app._addRoom` tab | Yes | First module to integrate |

We searched for and found nothing relevant: a maintained Showdown layout/resize userscript on Greasy Fork or OpenUserJS, "PS Plus", "Showdown Enhancements" or "PS Theme". The Greasy Fork site listing returned 403, so that part of the search relied on search-engine results.

## What Showdex does that we must not break

**Preact client**
- **Hellodex** is a real `PSRoomPanel` (id `hellodex`, `location:'right'`, `noURL`), opened with `PS.join`. Its React 18 root lives in `div[data-showdex="hellodex"]`.
- **Calcdex** rooms are `calcdex-<battleId>`.
- **It wraps `PS.getWidthFor`** for its own room types (320/628/628), so our width override must wrap whatever is installed at the time.
- **It replaces `window.Battle` / `window.Side`** and **replaces the `battle` room type** (`CalcdexPreactBattlePanel`):
  - it adds an overlay and a toggle next to the timer (`[data-calcdex-controls="battle-timer"]`);
  - on boot it deletes existing `battle-*` rooms and re-joins them.
  - Rules for us: never register our own `battle` room type; never cache battle classes or room DOM; re-resolve them through `PS.subscribe` or a MutationObserver.
- **Open question:** does Showdex's battle panel still call `PS.chooseBattleLayout`? If it does, our scale patch carries over unchanged. Check this in the first spike.
- It subscribes to `PS`, `PS.user` and `PS.prefs` (theme).

**Classic client**
- It wraps `app.receive` and `app.focusRoom`.
- It creates HTML rooms with `app.focusRoomRight`.
- It overrides each BattleRoom's `updateControls`, `updateMoveControls`, `updateSwitchControls` and `updateTeamControls` to inject its overlay toggle.
- It watches `html.dark` with a MutationObserver.

**Boot**
- It matches `play.pokemonshowdown.com`, `*.psim.us` and `play.radicalred.net`.
- It runs at `document_idle`.

## Lessons

1. **Keep the native DOM mounted, then tag and restyle it.** PS Pro's theater mode proves this survives both Showdex and re-renders. Re-anchor after every re-render.
2. **Always chain monkey-patches.** Load order against Showdex is not guaranteed.
   ```js
   const orig = PS.getWidthFor; PS.getWidthFor = function (room) { return mine(room) ?? orig.apply(this, arguments); };
   ```
3. **Register panels as real room types** so tabs, focus, keyboard navigation and Showdex's tab-follow all keep working.
4. **Hook at the client level, not the socket.** `app.receive`, `PS.receive`, `room.subscribe` and `battle.subscribe` are enough. MRH needed socket hooks only to catch traffic before the client loaded.
5. **Follow the client's theme state** (`html.dark` / `PS.prefs.theme`), because Showdex reads it.

## Official client status

- **New client tracking issue:** [#2715](https://github.com/smogon/pokemon-showdown-client/issues/2715) (open).
- **Layout prefs in the new client:**
  - `onepanel`: `false`, `true` or `'vertical'`
  - `battlelayout`: `side-by-side`, `top-and-bottom` or `scrolling`, each with an optional `-overlay`
  - theme: light, dark or system
  - custom backgrounds
  - mini-windows
  - drag a tab between left, right and mini-window
- **Missing from the client:** a resize splitter, a battle zoom above 1x, and more than one visible side room.
- **Maintainer stance on any of these:** none found. The closest is PR [#1585](https://github.com/smogon/pokemon-showdown-client/pull/1585), which handles spacing when the userlist is toggled.
