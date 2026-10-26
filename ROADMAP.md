# Roadmap

Status as of v0.1.1. The research and design behind this are in [RESEARCH.md](RESEARCH.md) and [docs/03-architecture.md](docs/03-architecture.md).

## Done

- Build and release: esbuild bundle to one `.user.js`, CI (tests and build), tag-triggered release with the script attached, auto-update URLs.
- Core: reversible chained patches, event bus, settings store with JSON export/import, module registry that tears down cleanly, public `window.ShowdownRestyler` API (`registerPanel`, `on`, `version`).
- Modules: core layout (draggable gutter, Wide/Focus/Stream presets), battle field scale, multiple side tabs with drag-to-place pinning, log/chat split, open team sheet panel, battle dock (with pop-out), theme, settings drawer.
- Tested live on the new client at 1280x720 and 1920x1080, including enabling and disabling every module, and the classic client (the script stays out of the way).

## Next

1. **Compatibility check with Showdex and Mock Regional Helper installed.** The design assumes they coexist (we wrap, never replace; we never register a `battle` room type), but it has not been run live. Includes how the field scale and dock sit with Showdex's battle overlay.
2. **Mock Regional Helper integration.** Register as a panel through `ShowdownRestyler.registerPanel` when present, keep its current tab code as the fallback (separate repo).
3. **Real Tampermonkey pass.** Everything so far was loaded by hand into the page. Confirm injection, the settings-saving bridge, and an actual auto-update cycle.
4. **Polish.** Empty states for the dock Chat tab, sprite blur at large scales, chat input behaviour (typing, history, focus) while logged in, higher-resolution screenshots.
5. **Known unknowns.** Tab-bar highlight and keyboard focus with several visible side rooms; the client changes often, so re-check after upstream updates (tested against `f49fca9`).

## Later

- Classic client adapter.
- Tooltip and timer modules.
- Pop-out battle window.
- Hotkeys and a compact teambuilder.
