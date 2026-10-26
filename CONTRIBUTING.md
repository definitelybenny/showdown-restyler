# Contributing

```bash
npm install
npm run watch   # rebuilds dist/showdown-restyler.user.js
npm test
```

Load `dist/showdown-restyler.user.js` in Tampermonkey and test on https://play.pokemonshowdown.com/preactalpha.

Rules: wrap client functions (never reassign), make every patch reversible, never register a `battle` room type (Showdex owns it), put classes on `<html>`. See `docs/03-architecture.md`.
