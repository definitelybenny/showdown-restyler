# Roadmap

Status as of v0.1.1. The research and design behind this are in [RESEARCH.md](RESEARCH.md) and [docs/03-architecture.md](docs/03-architecture.md).

## Done

- Build and release: esbuild bundle to one `.user.js`, CI (tests and build), tag-triggered release with the script attached, auto-update URLs.
- Core: reversible chained patches, event bus, settings store with JSON export/import, module registry that tears down cleanly, public `window.ShowdownRestyler` API (`registerPanel`, `on`, `version`).
- Modules: core layout (draggable gutter, Wide/Focus/Stream presets), battle field scale, multiple side tabs with drag-to-place pinning, log/chat split, open team sheet panel, battle dock (with pop-out), theme, settings drawer.
- Tested live on the new client at 1280x720 and 1920x1080, including enabling and disabling every module, and the classic client (the script stays out of the way).
- Verified by the author in real Tampermonkey (injection, settings saving, auto-update) and alongside Showdex and Mock Regional Helper.

## Next

1. **Mock Regional Helper integration** (planned by the author, later). Register as a panel through `ShowdownRestyler.registerPanel` when present, keep its current tab code as the fallback (separate repo).
2. **Polish.**
   - Empty states for the dock Chat tab.
   - Sprite blur at large scales.
   - Chat input behaviour (typing, history, focus) while logged in.
   - Higher-resolution screenshots.
3. **Known unknowns.** Tab-bar highlight and keyboard focus with several visible side rooms. The client changes often, so re-check after upstream updates (tested against `f49fca9`).

## Later

- Classic client adapter.
- Tooltip and timer modules.
- Pop-out battle window.
- Hotkeys and a compact teambuilder.
