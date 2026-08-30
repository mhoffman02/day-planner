# Keep gas-app/Script.html in Sync with src/

Google Apps Script's `HtmlService` cannot `import` ES modules, so logic that both the browser
client and `gas-app/Script.html` need has to end up as flat top-level declarations inside
`Script.html`'s single `<script>` scope. Two different mechanisms handle this depending on the
file:

## Generated (build step) — taskEngine, futureMatrixEngine, syncEngine, indexedDbStore, getLocalDateStr

`src/taskEngine.js`, `src/futureMatrixEngine.js`, `src/syncEngine.js`, `src/indexedDbStore.js`,
and `src/binderStore.js#getLocalDateStr` are bundled by `tools/build-gas-engines.js` (esbuild)
and spliced into `gas-app/Script.html` between the
`// === GENERATED begin: src/ engine bundle ===` / `// === GENERATED end ===` markers.
**Never hand-edit inside those markers** — it will be silently overwritten the next time the
build runs, and drift will just resurface as the exact bug this file used to describe.

Required pattern for these five files:

1. Change the logic in `src/*.js`, update/add its test in `tests/*.test.js`, run `npm test`.
2. Run `npm run build:gas` to regenerate the block in `gas-app/Script.html`. Review the diff —
   it should be a clean reflection of the `src/` change, nothing more.
3. `npm run build:gas:check` (wired into the pre-commit hook) fails the commit if `src/` changed
   without regenerating — it's the enforcement mechanism, replacing manual "did I remember to
   port this" review for these five files.
4. Smoke-test via `node server.js` (http://localhost:3000) if the change is behavior-visible. For
   `indexedDbStore.js` specifically, also do a live-browser offline round-trip against the
   regenerated `Script.html` (airplane mode → edit → reconnect → outbox flush) before deploying —
   the failure mode of a bad change here is silently-lost or duplicated offline edits, which no
   automated test can see.

`tools/gas-build/engines-entry.js` is the bundle's entry point — it's the list of exactly which
named exports from those five files get pulled into `Script.html`. Add a new export there (and
export it from the relevant `src/*.js` file) rather than writing new logic directly in
`Script.html`.

`src/indexedDbStore.js`'s exported names (`IDB_NAME`, `IDB_VERSION`, `IDB_STORE_*`, `idbGetDaily`,
`idbSaveDaily`, etc.) intentionally match `gas-app/Script.html`'s pre-existing per-store-function
naming, not the generic `storeName`-keyed shape — Script.html can't rename identifiers during the
splice, so the names in `src/` are the contract. Its generic `getItem`/`setItem`/`setItems`/
`getAllItems`/`deleteItem` API and `memoryFallbackStore` fallback branch are also now part of the
generated block; Script.html previously had no memory fallback; gaining one is an intentional,
low-risk resilience improvement (falls back to an in-memory per-session cache instead of a no-op
when IndexedDB is blocked/unsupported), not a bug.

## Still hand-duplicated — gasBridge

`src/gasBridge.js` (`GASBridge`, `OUTBOX_MUTATION_TYPES`, etc.) is **not** part of the generated
block. Its `gas-app/Script.html` copy (the `GASBridge` class) has diverged from `src/` in ways
that aren't just naming — e.g. mock-data ID generation differs (`t_${Date.now()}` vs.
`t_${Date.now()}_${Math.random()...}`), and `transferMasterTask` is reimplemented inline in
Script.html rather than reusing the already-bundled `transferMasterTaskToToday` from
`taskEngine.js`. Folding it into the build step means reconciling those behavioral differences
first — deciding which behavior is correct and updating the other side — not just wiring up
esbuild, so it's a separate piece of work, not a mechanical extension of `build-gas-engines.js`.

Until that reconciliation happens, treat it the old way: **any change to shared logic in
`src/gasBridge.js` must be hand-ported into `gas-app/Script.html`'s `GASBridge` class in the same
change.** Server-side equivalents (`gasTaskId` tagging/sync) live in `gas-app/Code.gs` and must
stay consistent with `src/syncEngine.js`'s model of the same relationship.

## Why

If only `src/` is updated, `npm test` stays green while production (`gas-app/`) silently keeps
the old behavior — the test suite gives false confidence because it never touches the file that
actually ships to the GAS web app. The build step closes this gap for the five files it covers;
for `gasBridge.js` it's still a real risk — check by hand before committing.
