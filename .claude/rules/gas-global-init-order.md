---
paths: ["gas-app/**"]
---

# GAS Shared State: No Global Variables, Only Namespace Objects With Getters/Setters

All `.gs` files in an Apps Script project share one global scope, and `clasp push` loads them in
alphabetical-by-filename order ([clasp#72](https://github.com/google/clasp/issues/72)). A global
variable read from another file can therefore be `undefined` or stale depending on which file
sorted first. That is a load-order race, and it fails silently. Function declarations are hoisted,
so a call made at run time is always safe. A variable read at load time is not.

- MUST NOT create global variables. No top-level `var`/`let`/`const` outside a file's IIFE (see
  [[gas-namespace-iife]]), and no `global.SOME_VALUE = value` exports of bare constants or state.
- MUST keep every shared value inside an IIFE-built global object (the "g"-style namespace:
  `DPConfig`, `DPQueue`, `DPEngines`, ...), frozen with `Object.freeze`. The value itself stays
  private to the IIFE. Other files read it through a getter (`DPConfig.sheetsMeter()`) and change it
  through a setter (`DPConfig.resetSheetsMeter()`, `DPConfig.setFeature(k, v)`), never by direct
  property access.
- MUST read namespaces lazily, inside a function at call time (`global.DPConfig.getSheetId()`),
  never in a top-level initializer, because the owning file may not have loaded yet.
- Anything needing a function call or service handle (`PropertiesService...`, `CacheService...`)
  is built on first use inside a getter and memoized in an IIFE-private variable.
- MUST NOT "fix" ordering by renaming a file to sort first (`_globals.gs`, `0_Globals.gs`). The next
  added file can sort ahead of it (`0Aardvark.gs` < `0_Globals.gs`). Getters have no file-order
  dependency at all.
- Exception: the top-level delegator functions in `Code.gs` that `google.script.run`, `doGet`,
  triggers and the IDE need (see [[gas-namespace-iife]]). They are hoisted functions, not variables.

Reference: the Sheets meter in `gas-app/Config.gs` (`sheetsMeter_` is IIFE-private, exposed only via
`DPConfig.sheetsMeter()` / `DPConfig.resetSheetsMeter()`).

See [[single-source-of-truth-constants]] for the related rule about not duplicating a shared value.

**Why:** the user, 2026-10-10: "NO GLOBAL variables -- wrap them all in a 'g' type global object to
avoid races." The older version of this rule allowed literal-only top-level globals and cited a
checker script (`tools/check-gas-global-init-order.js`) that no longer exists.
