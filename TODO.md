# TODO

Deferred follow-ups identified 2026-08-29 while auditing PLAN.md (all 74 checklist
items there are checked off — these are sub-items explicitly left open within
completed entries, not tracked as PLAN.md checkboxes).

- [x] **Reconcile `src/indexedDbStore.js` / `src/gasBridge.js` with their
  `gas-app/Script.html` hand-duplicated copies, then fold them into
  `tools/build-gas-engines.js`.** The `Script.html` copies have diverged in shape
  (different per-store function names, no memory-fallback branch) — decide which
  shape is correct, reconcile, then extend the esbuild pipeline to cover them like
  `taskEngine`/`futureMatrixEngine`/`syncEngine`. See `[[sync-src-and-gas-app]]`
  (PLAN.md 14.7c). — Done 2026-08-31: `indexedDbStore.js` was folded into the
  esbuild pipeline in a separate session (commits `ceacbea`/`edd267c`/`ff43af6`).
  For `gasBridge.js`, reconciled the `GASBridge` class methods by hand against
  `src/gasBridge.js` and fixed two real behavioral bugs along the way, not just
  cosmetic drift: (1) `transferMasterTask` in `Script.html` looked master tasks up
  against a permanently-stale 4-item mock seed list instead of using the caller's
  already-fetched task object, so transferring any real (non-seed) master task to
  today silently failed — fixed by changing the signature to accept the full task
  object directly (mirrors `forwardDailyTask`'s `sourceTaskSnapshot` pattern), and
  hardcoded the new task's sequence to always `[A1]` instead of finding the next
  open slot — now routes through `transferMasterTaskToToday`, matching `src/`.
  (2) `addCalendarEvent`'s mock branch ignored the real `gasTaskId` field the sync
  engine actually sends, only honoring a `syncTaskId` field nothing sends — fixed
  in `src/` to match `Script.html`'s already-correct fallback chain. Also aligned
  mock task-ID generation and `transferFutureItem`/`forwardDailyTask`'s mock
  branches to reuse `transferMasterTaskToToday`/`forwardTaskToDate` instead of
  ad hoc inline reimplementations. `gasBridge.js` was **not** folded into the
  esbuild pipeline like the five pure-function files — unlike those, it's a
  stateful class with a `useMock`/`window.google.script.run` runtime branch and a
  real `_runGasCall` network path, so splicing it in isn't a mechanical extension
  of the flat-function bundler; it stays hand-duplicated per
  `[[sync-src-and-gas-app]]`, now with behavior reconciled by hand instead of
  diverged. `npm test` (177/177) and `npm run build:gas:check` both pass.

- [x] **Add unit-test coverage for the sync persistence orchestration.** The
  reconcile-then-persist loop in `trigger2WaySync` lives entirely inline in
  untested Alpine objects, so bugs there are invisible to `npm test`. Extract a
  pure `planSyncPersistence(beforeTasks, beforeEvents, reconciled)` into
  `src/syncEngine.js`, shared by both `Script.html` and any future callers, and
  directly unit-testable (PLAN.md 14.6). — Done 2026-08-30: `planSyncPersistence`
  added to `src/syncEngine.js` with 4 new unit tests, wired through
  `tools/gas-build/engines-entry.js` into the generated `Script.html` block,
  `trigger2WaySync` now just walks the plan. All 177 tests + build:gas:check pass.

- [x] **Decide on offline bundle SWR refresh in `gh-pwa-shell`.** — Closed
  2026-08-30 as won't-fix: this was never a regression to restore. `gh-pwa-shell`
  commit `a4e73e1` ("redirect to live GAS deployment instead of fetching/mounting
  a bundle") removed `fetchRemoteBundle` deliberately, after **two** separate
  fetch-based implementations (raw `fetch()`, then a JSONP `<script src>`
  fallback) were both confirmed to never succeed — Google's GAS edge issues a
  302-to-login redirect before `doGet()` ever runs, blocking both approaches
  100% of the time. See `shell-gas-pattern.md` §9 for the full failed-approaches
  table. The replacement architecture (also in that commit) is correct as-is:
  an online, already-trusted app hands off via a real top-level navigation
  (`window.location.href`, which works because it's first-party navigation, not
  a cross-origin fetch/iframe); `BUILTIN_BUNDLES` + IndexedDB is purely the
  offline-cold-start fallback, refreshed only at build/publish time via
  `tools/build-shell-bundle.js` — never at runtime. **Do not re-attempt a
  runtime fetch-based SWR refresh in `gh-pwa-shell`** — it is provably
  impossible against GAS's current auth-redirect behavior, not merely unbuilt.

- [ ] **Verify `Event.getTag()`/`setTag()` read/write `extendedProperties.shared`
  on live GAS.** The `gasTaskId` dual-write fix assumes this and is safe either way,
  but the exact mechanism has never been confirmed against a live Apps Script run
  (PLAN.md 14.6).

- [x] **Smoke-test the re-landed esbuild bundler in a live browser before the next
  production deploy.** — Done 2026-08-31: built `tools/ensure-chrome.js` +
  `tools/e2e/{cdp-client.js,smoke-test.js}`, a dependency-free CDP driver that
  attaches to a genuinely-launched (non-Puppeteer) Chrome so Google sign-in
  isn't blocked by automation detection. Ran `smoke-test.js` against the pinned
  production `/exec` deployment: planner mounts (`.binder-container`, no
  `x-cloak`), zero console errors — confirmed via both an automated pass and a
  visual screenshot. The earlier "`/dev` 404s even as the authenticated script
  owner" observation was a false alarm, not a real bug: `/dev` only resolves
  against the deployment's own `@HEAD` ID (`clasp deployments` shows it
  separately, e.g. `AKfycbwb...@HEAD`), never the pinned versioned deployment
  ID from `.claude/rules/gas-deploy-pinned.md` — appending `/dev` to the
  pinned ID 404s by design since that ID is a fixed version snapshot.
  Re-tested `smoke-test.js` against the `@HEAD` deployment's own `/dev` URL:
  `planner-mounted`, 0 console errors, PASS. The e2e tooling itself now lives
  on `master` for reuse on future live-browser checks.
