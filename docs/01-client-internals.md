# Showdown client internals

Researched on 2026-10-26 against [`smogon/pokemon-showdown-client@f49fca9`](https://github.com/smogon/pokemon-showdown-client/tree/f49fca99f83d7b61495c45274092de0dfe7de071) (master, 2026-10-22). Line numbers drift, so search for the function names when they stop matching.

Legend:
- **[src]**: read from source.
- **[live]**: confirmed in a browser on the new client on 2026-10-26.
- **[unverified]**: inferred, not tested.

Source root: `play.pokemonshowdown.com/` in the repo. The classic client lives in `src/oldclient/*.js` and is served as `/js/oldclient/*.js`.

## 0. Two clients, both must be supported

| | Classic (Backbone + jQuery) | New (Preact) |
|---|---|---|
| Default? | **Yes**, at `play.pokemonshowdown.com/` [src][live] | Opt-in: `/preactalpha`, `/beta`, `/newclient`, or the cookie `preactalpha=1` |
| Switch | Options → "Default client: Old/New" writes the cookie. `/oldclient` always serves classic. | Same selector in its options popup |
| Entry | `js/oldclient/client.js` ... `app = new App()` (sync inline) | `js/client-main.js`, panels loaded with `defer` |
| CSS | `oldclient.css`, `battle.css`, `sim-types.css`, `utilichart.css` | `client2.css`, `battle.css`, `teambuilder.css` |
| Detect | `window.app && app._addRoom && app.rooms` | `window.PS && PS.roomTypes` (also `PS.join`) |

The classic source has moved to `oldclient/`, and the new-client tracking issue ([#2715](https://github.com/smogon/pokemon-showdown-client/issues/2715)) is open, so the new client is the long-term target. Today, most users (Showdex included) still run classic by default.

## 1. Globals (page context)

Both clients are plain scripts, so everything is on `window`. A userscript must run in page context, through `unsafeWindow` or an injected `<script>` (the MRH pattern).

| | Classic | Preact |
|---|---|---|
| App root | `app` (`App`, a Backbone.Router) | `PS` |
| Rooms | `app.rooms[id]`, `app.roomList`, `app.sideRoomList`, `app.curRoom`, `app.curSideRoom` | `PS.rooms[id]`, `PS.leftRoomList`, `PS.rightRoomList`, `PS.miniRoomList`, `PS.leftPanel`, `PS.rightPanel`, `PS.popups` |
| Classes | `Room`, `ChatRoom`, `BattleRoom`, `HTMLRoom`, `Topbar`, `Popup` | `PSRoom`, `PSRoomPanel`, `PSPanelWrapper`, `PSView`, `PSRouter`, `ChatRoom`, `BattleRoom`, `BattlePanel`, `preact` |
| Prefs | `Storage.prefs(k, v)`, `Dex.prefs` (no change event) | `PS.prefs`, `PS.prefs.set(k, v)`, `PS.prefs.subscribe(fn)` |
| Shared | `Battle`, `BattleScene`, `BattleTooltips`, `BattleLog`, `Dex`, `Teams`, `$` | The same |
| Per battle | `app.rooms[id].battle`, `.battle.scene` | `PS.rooms[id].battle`, `.battle.scene`. `room.__view` is debug-only: don't depend on it. |

## 2. Layout model

### Classic: `App.prototype.updateLayout` (`client.js` ~1830)

- Every room is a `div.ps-room` on `<body>`, absolutely positioned (`top:56px`).
- One left room (`curRoom`) and **at most one right room** (`curSideRoom`). The layout is computed from each room's `minWidth`, `bestWidth`, `maxWidth` and `minMainWidth`.
  - BattleRoom: `minWidth 320`, `minMainWidth 956`, `maxWidth 1180`.
  - ChatRoom: `minWidth 320`, `maxWidth 1024`.
- `Room.show(position, leftWidth)` writes **inline** `left`, `width` and `right`. Any room that isn't shown gets `$el.hide()`.
- `Dex.prefs('onepanel')` forces single panel. `rightpanelbattles` puts battles on the right.
- The topbar (`app.topbar.updateTabbar()`) assumes a single side slot.

### Preact: `PS.updateLayout` (`client-main.ts`)

`PS.getWidthFor(room)` returns `{minWidth, width, maxWidth}` per room type:

| Room type | Width (min / width / max) |
|---|---|
| mainmenu | 340 / 628 / 628 |
| chat, rooms, battles | 320 / 570 / 640 |
| teambuilder | 660 |
| battle (side-by-side layout) | 320 / 956 / 1180 |
| default | 640 |

`PS.calculateLeftPanelWidth()` returns one of three things, stored in `PS.leftPanelWidth`:
- `null` for vertical tabs. This is used for `prefs.onepanel === 'vertical'`, and automatically under 700x430.
- `0` for one panel.
- Otherwise, the left panel width in px.

`PSView.posStyle(room)` is static and returns the inline position:
```js
if (room === PS.leftPanel)  return { width: PS.leftPanelWidth + 'px', right: 'auto' };
if (room === PS.rightPanel) return { top: '56px', left: PS.leftPanelWidth + 1 + 'px' };
return { display: 'none' };
```

`PS.isVisible(room)` is true only for `leftPanel` and `rightPanel` (or mini-windows when the main menu is visible). `PSRoomPanel.shouldComponentUpdate` skips rooms that aren't visible, so **a room you force visible with CSS stops updating** unless `isVisible` is patched too.

Room locations are `'left' | 'right' | 'popup' | 'mini-window' | 'modal-popup'`. Mini-windows are collapsible boxes stacked inside the main menu (DMs, News). `PS.moveRoom()` and `PS.dragOnto()` move rooms between locations. There is no tiling concept beyond that.

[live] **Several side rooms visible at once works.** Test setup: `PSView.posStyle` was wrapped to return a slot (`top`/`bottom`/`left`) for each of the last N rooms in `PS.rightRoomList`, and `PS.isVisible` was wrapped so it returns true for them. Result: `battles` and `rooms` rendered stacked in the right column, live and updating, next to a scaled battle. Open questions:
- Tab-bar highlight and focus/keyboard behaviour for the extra room were not checked.
- Not tested with Showdex installed.

[live] At 1920x1080 with a battle on the left, `PS.leftPanelWidth` was 1256, but the field was still 640x360 at `transform:none`.

## 3. Battle field size

- `battle.css` sets `.battle{position:absolute;width:640px;height:360px}`, and `.innerbattle` is 640x360 too.
- `BattleScene.pos()` (`battle-animations.ts`) computes sprite positions as **hard-coded absolute px**, so the field cannot reflow. **Scaling it with a CSS transform is the only practical way to enlarge it.**
- **Both clients only ever scale down:**
  - **Classic.** `BattleRoom.updateLayout` applies `scale(width/640)` only when `width < 640`. It also sets `.battle-controls` `top = 360*scale + 10`. The log, chat input and userlist are hard-coded at `left:640px/641px` in `oldclient.css`.
  - **Preact.** `PS.chooseBattleLayout(width, height, pref)` caps the scale with `scale = Math.min(1, width/640, height/360)`. It returns `{battleWidth, battleHeight, layout, overlayControls}`. `BattlePanel` then applies `scale(battleHeight/360)` to the frame, and positions the controls, ChatLog, ChatTextEntry and userlist from `battleWidth`.
- **[live] Wrapping `PS.chooseBattleLayout` works.** It returned a larger `battleWidth/battleHeight`, then called `PS.update()`. The client then:
  - scaled the frame (`matrix(1.2167…)`, later 1.45 with a wider panel);
  - moved `.battle-controls` to `top:448px; width:779px`;
  - moved `.battle-log` to `left:779px`.

  The whole room relaid itself around the bigger field with no CSS needed.
- **[live] Wrapping `PS.calculateLeftPanelWidth`** to return a fixed 1500 also worked. The right panel moved to `left:1501px`. This is the basis for a draggable divider.
- Transform caveats [src, unverified at runtime]:
  - Tooltips use `.offset()` and live in `#tooltipwrapper` on `<body>`, so they should position correctly.
  - Clicks hit-test through transforms.
  - Bitmap sprites blur when upscaled. Try `image-rendering`, or prefer the higher-resolution sprite sets.

## 4. Battle room DOM

### Classic (`client-battle.js`)

```
.ps-room.ps-room-opaque
  .battle > .innerbattle …     .foehint
  .battle-log[role=complementary] > .inner.message-log, .inner-preempt
  .battle-log-add              (chat input)
  ul.battle-userlist
  .battle-controls             (rebuilt with $controls.html() on every request)
  button.battle-chat-toggle
```

`.small-layout` (under 830px) hides the log. `.tiny-layout` applies under 640px.

### Preact (`panel-battle.tsx`)

The layouts are `side-by-side`, `top-and-bottom`, `scrolling` and a phone layout, each with an optional `-overlay` variant, set by `prefs.battlelayout`. Side-by-side:

```
.ps-room#room-battle-…
  .scrollable-battle-container[style=width:W]
    BattleDiv > .battle                 (never re-renders: safe to touch)
    .battle-controls-container > .battle-controls[style=top:H+10;width:W]  (button.timerbutton …)
  .battle-log.hasuserlist[style=left:W;top:0;bottom:40px]     (ChatLog)
  .chat-log-add[style=left:W] > form.chatbox                  (ChatTextEntry)
  ul.userlist[style=left:W]
```

Inline styles are reapplied on every render. Either override them with `!important` CSS or patch the function that computes them.

### Log, chat and OTS share one stream (both clients)

- Chat lines are `div.chat`. Battle lines and turn headers are `.battle-history` and `h2.battle-history`. All of them go into the same `.battle-log .inner.message-log`.
- **The Open Team Sheet** comes from `|showteam|`. `BattleLog` (`battle-log.ts` ~345) renders it as `div.infobox > details.details > summary "Open team sheet for X"` inside that same log. The parsed data is also on `battle.sides[n].pokemon`, with `side.openTeamSheet = true` (`battle.ts` ~3759).
- Splitting them means building **filtered views**:
  - hide `.chat` in one panel;
  - render chat lines in another;
  - build the OTS panel from `side.pokemon` or the `|showteam|` line.

  Moving nodes doesn't work: new lines keep arriving in the original container, and Preact owns that tree.

## 5. Room / panel extension API

**Preact**

```js
class MyPanel extends PSRoomPanel {
  render() { return preact.h(PSPanelWrapper, { room: this.props.room }, preact.h('div', { id: 'my-root' })); }
}
Object.assign(MyPanel, { id: 'mytab', routes: ['mytab'], location: 'right', title: 'My Tab', noURL: true, Model: MyRoom });
PS.addRoomType(MyPanel);
PS.join('mytab', { noURL: true, autofocus: true });
```

- Ids must match `/^[a-z0-9-]+$/`.
- With `noURL`, a reload doesn't try to `/join` a server room. MRH also rewrites the URL back to `/`.
- Preact leaves children it didn't create alone, so we can render into that root ourselves.

**Classic**

```js
app._addRoom(id, 'html' | Ctor, nojoin, title)
```

- Then move the room from `roomList` to `sideRoomList`.
- Set `isSideRoom`, `minWidth` and `maxWidth`.
- No-op `leave`.
- Hook `destroy` for the close event.
- `app.focusRoomRight(id)`, then `app.topbar.updateTabbar()`.

This is the same technique Showdex and Mock Regional Helper use (see `mock-regional-helper.user.js` `openTab`/`registerNewTabType`).

## 6. Event hooks

| | Classic | Preact |
|---|---|---|
| Incoming | `app.receive(data)`, then `room.receive`, then `battle.add` | `PS.receive(msg)` |
| Outgoing | `app.send(msg, roomid)` | `PS.send(msg, roomid)` |
| State changes | Backbone events (`app.on('response:…')`), no layout event | `PS.subscribe(fn)` (any layout or room change), `room.subscribe(args => …)` (per parsed line) |
| Prefs | none | `PS.prefs.subscribe(key => …)` |
| Battle | `battle.subscribe(fn)` | the same |
| Background | `Storage.bg` | `PSBackground.subscribe(url => …)` |

WebSocket or Worker hooking isn't needed for layout work. Client-level hooks are enough.

## 7. Theming

- **There are no CSS custom properties** anywhere in the client CSS. Colours are hard-coded, with `.dark …` overrides: about 110 selectors in `oldclient.css`, 72 in `client2.css`, 101 in `battle-log.css` and 15 in `battle.css`.
- **Dark mode:**
  - Classic sets `html.dark` from `Dex.prefs('theme')` (`light`, `dark` or `system`).
  - Preact sets `document.body.className = dark ? 'dark' : ''`, which **wipes all body classes**. Put our theme classes on `<html>`.
- **Background:** both clients write an inline `body.style.background` and persist it in `localStorage.showdown_bg`. Override it with `!important`, or call `Storage.bg.set` / `PSBackground.set(url, 'custom')`. Both also inject `#mainmenubuttoncolors`.

## 8. Things that will fight us

- **Inline layout styles are recomputed constantly.**
  - Classic: `Room.show` and `BattleRoom.updateLayout`.
  - Preact: every render (`posStyle`, ChatLog `left`, controls `top`, frame transform).
  - Fix: patch the computing functions first, and fall back to `!important` CSS.
- **Preact re-renders undo DOM edits.** Don't move Preact-owned nodes. `.battle` (BattleDiv) is the exception.
- **Classic `.battle-controls` is rebuilt with `.html()`** on every request. Re-apply any decoration after each request (Showdex hooks `updateControls` for this).
- **Preact skips rendering hidden rooms** (`isVisible`).
- **Breakpoint classes** (`tiny-layout`, `small-layout`) only re-render when a breakpoint is crossed.
- **No CSP.** Injected `<style>` and inline scripts work.
- **Assets use hashed query strings** (`client.js?c32d7faa`). Never match on asset URLs. Patch at runtime once `PS` or `app` exists.
- **Timing:** classic creates `app` synchronously. Preact loads panels with `defer` (`PSRoomPanel` and the rest appear after `PS`). Poll for both, as MRH does.
- **The page framebusts,** so it can't be hosted in an iframe.
- **Ads** are injected into the main menu and room list (`hb.vntsm.com`).
