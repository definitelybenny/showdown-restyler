# Architecture proposal

**v1 target: the new (Preact) client.** That's the client the user plays on, and where Showdown development is heading.

The old client stays a later goal. Keep the host-adapter split so it can be added without touching modules. Until then, v1 should detect the old client and stay out of its way: log a message and do nothing.

## Core stance

**The client keeps its DOM, and we own the geometry.**

We don't build a shell that moves rooms into our own container. Three facts rule that out:
- Preact re-renders undo moved nodes.
- Preact skips rendering hidden rooms.
- Classic rebuilds `.battle-controls` on every request.

Instead, we work in three layers, preferred in this order:

1. **Patch the functions that compute layout.** For example `PS.chooseBattleLayout`, `PS.calculateLeftPanelWidth`, `PSView.posStyle`, `PS.isVisible`, `App.prototype.updateLayout` and `BattleRoom.prototype.updateLayout`. The client then lays itself out around our numbers. This was verified live for the first four on the new client.
2. **Use `!important` CSS** as the backstop for inline styles we can't reach. Theme tokens go here too.
3. **Add our own panels as real room types** (`PS.addRoomType` / `app._addRoom`). We render into a root div that the client leaves alone.

Hard rules:
- **Wrap, never reassign.** Every patch wraps whatever is installed at that moment, because Showdex may have wrapped it first:
  ```js
  const prev = PS.getWidthFor; PS.getWidthFor = function (room) { return mine(room) ?? prev.apply(this, arguments); };
  ```
- **Every patch is reversible.** Each module records how to undo its patches, so a module can be turned off live.
- **Never register a `battle` room type.** Showdex owns it.
- **Never cache room DOM or battle classes.** Re-resolve them on `PS.subscribe` (Preact) or after `updateLayout` / `updateControls` (classic).
- **Put our classes on `<html>`, not `<body>`.** Preact overwrites `body.className`.

## The five frustrations mapped to hooks

| # | Problem | New client (Preact) | Classic client | Status |
|---|---|---|---|---|
| 1 | Field capped at 640x360 | Wrap `PS.chooseBattleLayout`. Return a larger `battleWidth`/`battleHeight` (fit to panel width and height, user max). The client scales the frame and moves the controls and log itself. | Wrap `BattleRoom.prototype.updateLayout`. Set the frame transform to `scale(s)` and `.battle-controls` `top = 360s+10`. CSS-move `.battle-log`, `.battle-log-add` and `.battle-userlist` off `left:640px`. | Preact **verified live**. Classic from source. Showdex interaction **unverified**. |
| 2 | Dead space under controls | A **dock** region below `.battle-controls-container`. It's our own element inside the room, absolutely positioned, which Preact ignores. Modules render into it. | The same: an element appended to the room `el` and re-positioned after `updateLayout`. | Design |
| 3 | Log, chat and OTS in one box | **Filtered views.** CSS hides `.chat` lines in the native log (it becomes "Battle log"). A Chat panel renders `|c|` / `|raw|` lines from `room.subscribe`. The native chat input is moved under it with CSS. An OTS panel reads `battle.sides[n].pokemon` or `|showteam|`. The native OTS `<details>` is hidden. | Same idea. The source is an `app.receive` / `room.receive` wrap. | Design. Chat-input reposition **unverified**. |
| 4 | No resizing | Our own **gutter** elements (fixed overlay) between panels. Dragging stores px or a ratio. Wrapped `PS.calculateLeftPanelWidth` returns the stored width, then `PS.update()`. Horizontal splits use the same slot math as #5. | Wrap `App.prototype.updateLayout`, override `leftWidth`, and re-call `Room.show`. | Width override **verified live**. Gutters are design. |
| 5 | One side tab at a time | Wrap `PSView.posStyle` to return a slot rect for the N "pinned" right rooms. Wrap `PS.isVisible` so they keep rendering. Handle any room generically: Hellodex, MRH, chat rooms. | Override `updateLayout`/`show`/`hide` to show several `sideRoomList` rooms. **Main risk:** `topbar` assumes a single `curSideRoom`. | Preact **verified live** (2 rooms stacked). Tab highlight and focus untested. |

Extras:
- **Outdated look:** a token-based theme layer. It also drives the dark/light state of `html.dark` and `PS.prefs.theme` so Showdex follows.
- **"Open team sheet in another tab":** the OTS panel can mount in the dock, in a side room, or in a pop-out `window.open` that we write into. Same component, different host.
- **"Remove chat but keep team sheet":** that's just turning the Chat panel off while the OTS panel stays on.

## Layout model (ours)

The layout is described as data, not code, so presets, persistence and future drag-and-drop all use one format:

```js
layout = {
  version: 1,
  leftWidth: 0.62,                 // ratio of the viewport, or px
  battle: {
    fieldScale: 'fit' | 1.5,       // 'fit' = largest that fits, capped by maxScale
    maxScale: 2,
    dock: ['ots', 'notes'],        // panel ids shown in the dock, tabbed
    rightColumn: [['log', 0.55], ['chat', 0.45]],  // split of the battle room's own right column
  },
  side: { pinned: 2, split: 'vertical', sizes: [0.5, 0.5] },  // how many side rooms show at once
  presets: { active: 'wide' },
}
```

Presets (`wide`, `focus`, `stream`) are just named `layout` objects. The engine turns a `layout` plus the viewport into concrete numbers that the client adapters feed to the patched functions. That way the math is a pure, testable function.

## Module system

Bundle with esbuild from `src/` into one `.user.js`, as MRH's refactor does (`scripts/build.mjs`, `src/header.txt`). Modules are plain objects:

```js
export default {
  id: 'battle-scale',
  name: 'Battle field scale',
  clients: ['preact', 'classic'],          // which adapters it supports
  defaults: { maxScale: 2, mode: 'fit' },  // settings schema (default values + types)
  css: (settings, ctx) => `...`,           // optional; injected/removed with the module
  setup(ctx) { /* apply patches via ctx.patch, return nothing */ },
  // teardown is automatic: ctx.patch/ctx.on/ctx.css are all tracked and undone on disable
};
```

### `ctx` (what a module gets)

| Member | Purpose |
|---|---|
| `ctx.host` | The client adapter: `'preact'` or `'classic'`, plus a normalised API (below) |
| `ctx.patch(obj, key, wrapper)` | Chained, reversible monkey-patch |
| `ctx.on(event, fn)` | Event bus: `room:open`, `room:close`, `room:focus`, `battle:start`, `battle:line`, `battle:request`, `layout:change`, `theme:change`, `settings:change` |
| `ctx.settings` | This module's settings. Reactive, persisted. |
| `ctx.css(text)` | Scoped style tag, removed on disable |
| `ctx.panels.register({id, title, icon, render, hosts})` | Declare a panel that can live in the dock, a battle column, a side room or a pop-out |
| `ctx.log` | Prefixed console logger (`[Restyler:battle-scale]`) |

### Host adapters (`src/hosts/preact.js`, `src/hosts/classic.js`)

Both expose the same surface, so modules rarely branch on the client:
- `rooms()`, `room(id)`, `battleRooms()`, `focused()`
- `openSideRoom({id, title, icon, mount})`, `closeRoom(id)`
- `requestLayout()`: `PS.update()` or `app.updateLayout()`
- `layoutHooks`: the specific functions to wrap for left width, battle size, side placement and visibility
- `theme`: get/set dark mode, background

Detection follows Showdex: `PS.join` means preact and `app.receive` means classic, re-checked until one appears (60 s timeout, as in MRH).

### Settings and storage

- **One store,** with `GM_getValue` / `GM_setValue` under key `restyler:v1`, shaped `{ modules: {id: {enabled, ...settings}}, layout, theme }`.
- **Versioned migrations,** so a layout from v1 keeps working.
- **Export and import as JSON.** Layouts and themes are shareable.
- **Settings UI:** a gear on the topbar opens a drawer (see `mockup.html`). Every module's `defaults` auto-render basic controls. Modules can supply a custom renderer.

### Public API for other scripts

`window.ShowdownRestyler` is exposed in page context:
- `registerPanel(def)`: register a panel.
- `on(event, fn)`: subscribe to events.
- `version`: the API version.

This lets Mock Regional Helper (or any script) put its tab into the layout as a first-class panel, without depending on our internals. MRH keeps working without us. If the API is present, it registers itself; if not, it falls back to its current tab code.

## Planned module list

| Module | Depends on | Notes |
|---|---|---|
| `core-layout` | none | Left/right width, gutters, presets, persistence |
| `battle-scale` | `core-layout` | #1; sprite `image-rendering` option |
| `battle-dock` | `battle-scale` | #2; hosts panels under the controls |
| `log-chat-split` | none | #3; Battle log and Chat panels; hide-chat option |
| `ots-panel` | none | Open team sheet as cards; dock, side or pop-out |
| `multi-side` | `core-layout` | #5; N visible side rooms, stacked or columns |
| `theme` | none | Tokens, presets, custom accent, background, font |
| `settings-ui` | none | Drawer and import/export |
| Later | | Tooltip enhancements, timer styling, hotkeys, compact teambuilder, pop-out battle window |

## Risks / open questions

1. **Showdex's replacement battle panel.** Does it still call `PS.chooseBattleLayout`, and where does its overlay sit when the field is scaled? Test with Showdex installed in the first spike.
2. **Classic multi-side-room** fights the topbar's single-slot model. It may be preact-only in v1.
3. **Chat input relocation** in Preact. `ChatTextEntry` gets inline `left` every render, so we need CSS `!important` and to check that focus and history still work.
4. **Upscaled sprite blur.** Options: `image-rendering`, the gen5 sprite set, or accept it.
5. **Breakpoints.** The client's `tiny`/`small` layout classes change behaviour at fixed widths, so our sizes must avoid tripping them unintentionally.
6. **Client churn.** The new client is under active development. Pin the tested commit in the docs and keep the adapter thin.

## Suggested first spike (when code starts)

On the Preact client only:
1. Inject the wrappers for `chooseBattleLayout`, `calculateLeftPanelWidth`, `posStyle` and `isVisible`.
2. Add one draggable gutter.
3. Persist the width.
4. Test with Showdex and MRH both installed.

That proves frustrations 1, 4 and 5 and the compatibility story at once. Classic support comes after v1.
