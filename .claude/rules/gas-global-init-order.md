---
paths: ["gas-app/**"]
---

# GAS Shared State: No Globals, Only Frozen Namespace Objects

`clasp push` loads `.gs` files alphabetically ([clasp#72](https://github.com/google/clasp/issues/72)), so a global variable read from another file can be `undefined` or stale: a silent load-order race. Hoisted functions called at run time are safe; variables read at load time are not.

- No global variables: no top-level `var`/`let`/`const` outside a file's IIFE ([[gas-namespace-iife]]), no `global.X = <bare constant/state>`.
- Shared values live inside an IIFE-built, `Object.freeze`d namespace (`DPConfig`, `DPQueue`, `DPEngines`, ...). The value stays IIFE-private; other files use getters (`DPConfig.sheetsMeter()`) and setters (`DPConfig.resetSheetsMeter()`, `DPConfig.setFeature(k, v)`), never direct property access.
- Read namespaces lazily at call time (`global.DPConfig.getSheetId()`), never in a top-level initializer.
- Service handles (`PropertiesService...`, `CacheService...`) are built on first use in a getter and memoized IIFE-privately.
- Don't fix ordering by renaming a file to sort first (`_globals.gs`, `0_Globals.gs`); the next file can sort ahead of it.
- Exception: the top-level delegator functions in `Code.gs` for `google.script.run`/`doGet`/triggers/IDE: hoisted functions, not variables.

Reference: `sheetsMeter_` in `gas-app/Config.gs`. See [[single-source-of-truth-constants]].
Enforced: ESLint `no-restricted-syntax` (`GAS_GLOBALS`, `eslint.config.js`): top-level `var`/`let`/`const` or `global.X = <literal/array/object/new>` fails lint.
**Why:** user 2026-10-10: "NO GLOBAL variables -- wrap them all in a 'g' type global object to avoid races."
