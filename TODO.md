# TODO

Deferred follow-ups identified 2026-08-29 while auditing PLAN.md (all 74 checklist
items there are checked off — these are sub-items explicitly left open within
completed entries, not tracked as PLAN.md checkboxes).

- [ ] **Reconcile `src/indexedDbStore.js` / `src/gasBridge.js` with their
  `gas-app/Script.html` hand-duplicated copies, then fold them into
  `tools/build-gas-engines.js`.** The `Script.html` copies have diverged in shape
  (different per-store function names, no memory-fallback branch) — decide which
  shape is correct, reconcile, then extend the esbuild pipeline to cover them like
  `taskEngine`/`futureMatrixEngine`/`syncEngine`. See `[[sync-src-and-gas-app]]`
  (PLAN.md 14.7c).

- [ ] **Add unit-test coverage for the sync persistence orchestration.** The
  reconcile-then-persist loop in `trigger2WaySync` lives entirely inline in
  untested Alpine objects, so bugs there are invisible to `npm test`. Extract a
  pure `planSyncPersistence(beforeTasks, beforeEvents, reconciled)` into
  `src/syncEngine.js`, shared by both `Script.html` and any future callers, and
  directly unit-testable (PLAN.md 14.6).

- [ ] **Decide on offline bundle SWR refresh in `gh-pwa-shell`.** The applied
  `pwa.js.patch` removed all `fetchRemoteBundle` call sites, freezing the offline
  bundle cache at whatever shipped in the shell (no more background refresh),
  orphaning `getCompiledAppBundle()`/`tools/build-shell-bundle.js`. Needs a product
  decision: is static-offline intended, or should a fire-and-forget
  stale-while-revalidate refresh be added back? (separate `gh-pwa-shell` repo;
  PLAN.md 14.6).

- [ ] **Verify `Event.getTag()`/`setTag()` read/write `extendedProperties.shared`
  on live GAS.** The `gasTaskId` dual-write fix assumes this and is safe either way,
  but the exact mechanism has never been confirmed against a live Apps Script run
  (PLAN.md 14.6).

- [ ] **Smoke-test the re-landed esbuild bundler in a live browser before the next
  production deploy.** The 14.7 re-land was pushed to `/dev` only (`clasp push
  --force`) and verified via `npm test` / `npm run build:gas:check` / `node --check`,
  not a live-browser load — no browser-automation tool was available in that
  session. Load `/dev` manually and confirm the app mounts before the next `-i`
  production `clasp deploy` (PLAN.md 14.7).
