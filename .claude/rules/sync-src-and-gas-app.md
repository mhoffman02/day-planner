# Keep gas-app/Script.html in Sync with src/

Google Apps Script's `HtmlService` cannot `import` ES modules, so logic that both the browser
client and `gas-app/Script.html` need has to end up as flat top-level declarations inside
`Script.html`'s single wrapping IIFE. Two different mechanisms handle this depending on the file:

## Generated (build step) — taskEngine, futureMatrixEngine, syncEngine, getLocalDateStr

`src/taskEngine.js`, `src/futureMatrixEngine.js`, `src/syncEngine.js`, and
`src/binderStore.js#getLocalDateStr` are bundled by `tools/build-gas-engines.js` (esbuild) and
spliced into `gas-app/Script.html` between the
`// === GENERATED begin: src/ engine bundle ===` / `// === GENERATED end ===` markers.
**Never hand-edit inside those markers** — it will be silently overwritten the next time the
build runs, and drift will just resurface as the exact bug this file used to describe.

Required pattern for these four files:

1. Change the logic in `src/*.js`, update/add its test in `tests/*.test.js`, run `npm test`.
2. Run `npm run build:gas` to regenerate the block in `gas-app/Script.html`. Review the diff —
   it should be a clean reflection of the `src/` change, nothing more.
3. `npm run build:gas:check` (wired into the pre-commit hook) fails the commit if `src/` changed
   without regenerating — it's the enforcement mechanism, replacing manual "did I remember to
   port this" review for these four files.
4. Smoke-test via `node server.js` (http://localhost:3000) if the change is behavior-visible.

`tools/gas-build/engines-entry.js` is the bundle's entry point — it's the list of exactly which
named exports from those four files get pulled into `Script.html`. Add a new export there (and
export it from the relevant `src/*.js` file) rather than writing new logic directly in
`Script.html`.

## Still hand-duplicated — indexedDbStore, gasBridge

`src/indexedDbStore.js` and `src/gasBridge.js` (`GASBridge`, `OUTBOX_MUTATION_TYPES`, etc.) are
**not** part of the generated block yet, so any change to shared logic in either file must still
be hand-ported into `gas-app/Script.html` in the same change.

As of 2026-08-28, `indexedDbStore.js`'s *shape* has been reconciled: `Script.html`'s copy
(`idbGetItem`/`idbSetItem`/`idbGetAllItems`/`idbDeleteItem` plus `idbMemoryFallback`, `IDB_NAME`,
`IDB_VERSION`, and all five `IDB_STORE_*` constants) now matches `src/indexedDbStore.js`'s
generic `storeName`-keyed API, memory-fallback branch, and 5-store schema one-for-one — it used
to be a set of per-store functions with no fallback and only 3 of the 5 stores. `IDB_VERSION` was
bumped 2 → 3 so already-onboarded browsers actually get the two new (currently unused)
`monthlyNotes`/`masterTasks` stores created via `onupgradeneeded`, instead of silently keeping
the stale 3-store schema forever. **Bump `DB_VERSION` in both files together** any time `STORES`
gains or removes an entry — the version number is what makes a browser that already has an older
schema actually run the upgrade. The code itself is still duplicated line-for-line, not shared,
so it remains a hand-port risk, not a mechanical build target — see the entry point comment on
why it isn't in `build-gas-engines.js` yet.

`src/gasBridge.js` (`GASBridge`, `OUTBOX_MUTATION_TYPES`) has **not** been reconciled — it's a
much larger surface (mock data, per-method business logic, `google.script.run` vs. mock
branching) and its `Script.html` copy may still diverge from `src/` beyond naming. Treat it the
old way: hand-port any shared-logic change into `gas-app/Script.html` in the same change, and
diff the two copies by hand before committing. Server-side equivalents (`gasTaskId`
tagging/sync) live in `gas-app/Code.gs` and must stay consistent with `src/syncEngine.js`'s model
of the same relationship.

## Why

If only `src/` is updated, `npm test` stays green while production (`gas-app/`) silently keeps
the old behavior — the test suite gives false confidence because it never touches the file that
actually ships to the GAS web app. The build step closes this gap for the four files it covers;
for `indexedDbStore.js`/`gasBridge.js` it's still a real risk — check by hand before committing.
