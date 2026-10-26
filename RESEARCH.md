# Showdown Restyler: research

**Goal:** a Tampermonkey userscript that lets you restyle and rearrange everything in Pokémon Showdown. That means resizable panes, a bigger battle field, battle log, chat and team sheet in separate panels, several side tabs open at once, and a modern theme. It should be built from modules so it is easy to extend.

**v1 target:** the new (Preact) client.

**When and against what:** researched 2026-10-26 against [`smogon/pokemon-showdown-client@f49fca9`](https://github.com/smogon/pokemon-showdown-client/tree/f49fca99f83d7b61495c45274092de0dfe7de071). Line numbers drift; search by function name.

**Evidence labels** used throughout:
- **[src]**: read from client source.
- **[live]**: tested in a browser by spectating a battle on the new client, using throwaway console code.
- **[unverified]**: inferred, not tested.

Detail lives in:
- @docs/01-client-internals.md: full hook reference
- @docs/02-prior-art.md: existing tools
- @docs/03-architecture.md: proposed design
- @docs/mockup.html: layout mockup

---

## 1. Questions this research answers

1. Why is the battle field so small, and can it be made bigger?
2. Can the panes be resized?
3. Can the battle log, chat and open team sheet be separated?
4. Can more than one side tab be visible at once?
5. What can a userscript hook into, and what will fight it?
6. What already exists, and what must we stay compatible with (Showdex, Mock Regional Helper)?

---

## 2. The two clients

| | Classic | New (Preact) |
|---|---|---|
| Served at | `play.pokemonshowdown.com/` (default) [src][live] | `/preactalpha`, `/beta`, `/newclient`, or cookie `preactalpha=1` |
| Root object | `window.app` | `window.PS` |
| Source | `src/oldclient/*.js` | `src/client-main.ts`, `panels.tsx`, `panel-battle.tsx`, … |
| Direction | Moved to `oldclient/` | Tracking issue [#2715](https://github.com/smogon/pokemon-showdown-client/issues/2715), active development |

Both clients are plain scripts with everything on `window`. Their classes and functions can be patched from page context. **No CSP** is set, so injected `<style>` and `<script>` work [src].

---

## 3. Findings per frustration

### 3.1 The battle field is capped at 640x360

**Cause:**
- **[src]** `battle.css` fixes `.battle` at 640x360.
- **[src]** Sprite positions are hard-coded absolute pixels in `BattleScene.pos()`, so the field can't reflow. It can only be scaled with a CSS transform.
- **[src]** The new client already scales the field with a transform, but caps it in `PS.chooseBattleLayout()`:
  ```ts
  let scale = Math.min(1, width / 640, height / 360);
  ```
  The `1` means it only ever shrinks.
- **[live]** At 1920x1080 the left panel was 1256px wide, but the field stayed at 640x360 with `transform: none`.

**Test [live]:**
- Wrapping `PS.chooseBattleLayout` to return a larger `battleWidth`/`battleHeight` scaled the frame to 1.22x, then 1.45x with a wider panel.
- The client moved `.battle-controls` (`top: 448px; width: 779px`) and `.battle-log` (`left: 779px`) by itself.
- No extra CSS was needed.

**Conclusion:** solvable with one function wrap.

**Open:**
- Sprites will blur when upscaled because they are bitmaps [unverified].
- Showdex replaces the battle panel. Does it still call `chooseBattleLayout`? [unverified]

### 3.2 Wasted space under the controls

- **[src]** The controls are positioned at `battleHeight + 10` inside `.battle-controls-container`. Nothing uses the area below them.
- **[src]** The battle frame (`BattleDiv`) never re-renders, and Preact leaves foreign children alone. So an element we add to the room stays put.

**Conclusion:** we can add our own "dock" area there and host any panel in it (team sheet, notes, calc).

### 3.3 Battle log, chat and team sheet share one box

- **[src]** Everything is appended to a single `.battle-log .inner.message-log`:
  - chat lines are `div.chat`;
  - battle lines are `.battle-history`;
  - the open team sheet (`|showteam|`) is rendered by `BattleLog` as `div.infobox > details > summary "Open team sheet for X"`.
- **[src]** The team sheet is also parsed into `battle.sides[n].pokemon`, with `side.openTeamSheet = true`.
- **[src]** Preact owns the log tree, and new lines keep arriving there. Moving nodes out would break or be undone.

**Conclusion:** split the box with filtered views, not by moving nodes.
- Use CSS to hide chat lines in the native log, so it becomes the battle log.
- Render a separate chat panel from `room.subscribe`.
- Build the team-sheet panel from `side.pokemon`.

**Open:** moving the chat input. `ChatTextEntry` gets an inline `left` on every render, so it needs `!important` CSS [unverified].

### 3.4 Panes can't be resized

- **[src]** No splitter exists. Widths come from fixed min/width/max values per room type in `PS.getWidthFor()`:

  | Room | min / width / max |
  |---|---|
  | main menu | 340 / 628 / 628 |
  | chat | 320 / 570 / 640 |
  | battle (side-by-side) | 320 / 956 / 1180 |

- **[src]** `PS.calculateLeftPanelWidth()` sets `PS.leftPanelWidth`. `PSView.posStyle()` then turns that into inline `left`/`width` on every render.
- **[live]** Wrapping `calculateLeftPanelWidth` to return 1500 moved the divider: the right panel went to `left: 1501px`, and the battle field grew with it.

**Conclusion:** a draggable gutter only has to store a width and return it from that wrap.

### 3.5 Only one side tab is visible

- **[src]** `PS.leftPanel` and `PS.rightPanel` are single slots. `posStyle()` gives every other room `display: none`.
- **[src]** `PSRoomPanel.shouldComponentUpdate` skips rooms that `PS.isVisible()` says are hidden. So un-hiding a room with CSS alone would leave it frozen.
- **[live]** Test:
  - Wrap `PSView.posStyle` to give the last two `PS.rightRoomList` rooms a top-half and bottom-half slot.
  - Wrap `PS.isVisible` to return true for them.
  - Result: two side rooms rendered stacked and updating live, next to a scaled battle.

**Conclusion:** works generically for any side room (Showdex's Hellodex, Mock Regional Helper, chat rooms).

**Open:**
- Tab-bar highlight and keyboard focus for the extra room [unverified].
- Behaviour with Showdex installed [unverified].

### 3.6 Outdated look

- **[src]** The client CSS has **no CSS variables**. Colours are hard-coded, with `.dark` overrides (about 72 in `client2.css`, 101 in `battle-log.css`).
- **[src]** Preact sets `document.body.className` to `'dark'` or `''`, which wipes any other body classes. Our theme classes have to go on `<html>`.
- **[src]** The background is an inline `body` style, persisted in `localStorage.showdown_bg`.

**Conclusion:** theming means a token layer of our own that overrides the client's selectors.

---

## 4. Hook surface (new client)

| Need | Hook | Evidence |
|---|---|---|
| Battle field size | `PS.chooseBattleLayout(w, h, pref)` | [live] |
| Left/right split | `PS.calculateLeftPanelWidth()`, `PS.getWidthFor(room)` | [live] / [src] |
| Panel placement | `PSView.posStyle(room)` (static) | [live] |
| Keep rooms rendering | `PS.isVisible(room)` | [live] |
| Re-layout | `PS.update()`, `window` `resize` | [live] |
| Custom panels | `PS.addRoomType(Panel)` + `PS.join(id, {noURL})`, render with `preact.h` into a root div | [src]; used by Showdex and MRH |
| State changes | `PS.subscribe(fn)`, `PS.prefs.subscribe(fn)` | [src] |
| Battle lines | `room.subscribe(fn)`, `battle.subscribe(fn)`, `PS.receive` | [src]; MRH uses `PS.receive` |
| Theme / background | `PS.prefs.theme`, `PSBackground` | [src] |

**Things that fight us:**
- Inline styles are reapplied on every render.
- Preact undoes DOM moves.
- Hidden rooms skip rendering.
- Breakpoint classes (`tiny`/`small` layouts) switch behaviour at fixed widths.
- Asset URLs have hashed query strings, so we can't match on them.
- Panel classes load with `defer`, after `PS` exists.

---

## 5. Prior art

| Tool | Relevance |
|---|---|
| [Showdex](https://github.com/doshidak/showdex) | **Must stay compatible.** It registers Hellodex as a real side room, **wraps `PS.getWidthFor`**, replaces `window.Battle`/`Side`, **replaces the `battle` room type**, and re-joins battle rooms on boot. |
| [Pokémon Showdown Pro](https://github.com/Ryukotsuki/PokemonShowdownPro) | An Electron app. Its "theater mode" is the closest existing layout work: it tags native nodes and re-lays them out with CSS, keeps the client mounted, and coexists with Showdex. |
| [Showdown Battle UI Overhaul](https://github.com/reachforaryan/pokemon-showdown-visual-extension) | A small extension: battle/chat split and a scaled canvas, done with CSS and observers. |
| [Showdown Randbats](https://greasyfork.org/en/scripts/526823-showdown-randbats) | A userscript that wraps `BattleTooltips` prototypes. A pattern for future tooltip modules. |
| [Mock Regional Helper](https://github.com/definitelybenny/mock-regional-helper) | Ours. Page-context hooks via CustomEvents, side tab via `PS.addRoomType`, esbuild bundling. Reusable patterns. |

No maintained layout or resize userscript for Showdown exists on Greasy Fork or OpenUserJS. No maintainer statement on bigger battles, resizing, or multiple side rooms was found.

---

## 6. Implications for the design

These follow directly from the findings above. The full proposal is in @docs/03-architecture.md.

1. **Patch the layout math, don't rebuild the UI.** The client re-lays itself out correctly once its functions return our numbers (3.1, 3.4, 3.5).
2. **Wrap, never replace.** Showdex wraps the same functions and owns the `battle` room type (section 5).
3. **Split content with filtered views,** not node moves (3.3).
4. **New panels are real room types,** so tabs, focus and Showdex's tab-follow keep working.
5. **Themes need our own token layer** on `<html>` (3.6).

---

## 7. Still unknown

- How the field scale, the extra side rooms and the dock interact with Showdex installed.
- Tab-bar and focus behaviour with several visible side rooms.
- Relocating the chat input in Preact.
- How bad sprite blur is at 1.5x–2x.
- Anything on the classic client. It is out of scope for v1 and only checked against source.

---

## 8. Next steps

Architecture, module design and layout model: @docs/03-architecture.md. Hook reference: @docs/01-client-internals.md. Compatibility notes: @docs/02-prior-art.md. Visual target: @docs/mockup.html.

1. **Project setup.** esbuild bundling of `src/` into one `.user.js`, the same as Mock Regional Helper. Add the userscript header and page-context injection.
2. **First spike: the core layout hooks.** On the new client, wrap `chooseBattleLayout`, `calculateLeftPanelWidth`, `posStyle` and `isVisible`. Add one draggable gutter and save the width.
3. **Compatibility check.** Run the spike with Showdex and Mock Regional Helper installed, and resolve the open items in section 7.
4. **Module framework.** Host adapter, `ctx` (patch, events, settings, css, panels), settings store, and the public `window.ShowdownRestyler` API.
5. **Build the v1 modules:**
   - `core-layout`: presets, gutters
   - `battle-scale`
   - `multi-side`
   - `log-chat-split`
   - `ots-panel`
   - `battle-dock`
   - `theme`
   - `settings-ui`
6. **Hook Mock Regional Helper into the panel API.** It should register itself when the API is present and keep its current tab code as the fallback.
7. **After v1:** classic client adapter, tooltip and timer modules, pop-out windows.
