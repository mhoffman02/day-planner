# Active Tasks (TODO)

Session completed 2026-09-28: see [`TODO_HISTORY.md`](file:///home/mike/projects/day-planner/TODO_HISTORY.md)'s 2026-09-28 entries for what shipped (Index date-column fix, Future Planning Drive-scope bug fixed live; Phase 19 closed — `drive.readonly` kept as-is, WORK repointed to version 92 and user-confirmed; WORK parity verified @91, voice typing popup polish, notes empty-state, Monthly Calendar today-highlight, About.html rewrite).

## Phase 20: Future Planning Items as Real Tasks

See `PLAN.md`'s Phase 20 for full rationale (born from a 2026-09-28 live bug: `DriveApp.Folder.createFile()` demanded broad `drive` scope even for the app's own folder — patched for now, but the real fix is moving Future Planning off Drive-file storage onto the Tasks API).

- [ ] Rework `addFutureItem`/`updateFutureItemStatus`/`transferFutureItemToDay`/`rollForwardPendingItems`/`deleteFutureItem` in `gas-app/Code.gs` to operate on Tasks (dueDate-keyed) instead of the JSON bucket.
- [ ] Rework `getFutureMatrixData_`/`getFutureMatrix` to query Tasks and group by `dueDate`'s month.
- [ ] When a new item has no specific day, default `dueDate` to the last day of the target month.
- [ ] Update `src/futureMatrixEngine.js` and its 20+ tests in `tests/futureMatrixEngine.test.js` for the new data shape.
- [ ] Update `src/app.js`/`gas-app/Script.html` bindings and the Future Planning view in `Index.html`/root `index.html`.
- [ ] Decide a migration path for existing `future-matrix-*.json` files already in users' Drive folders.
- [ ] Verify live (HOME, then WORK): no-day items land on the last day of the month; Franklin status cycling / transfer-to-day / roll-forward still work.

## Loose end (unrelated to Phase 20)

- [ ] **WORK deployment repoint**: version 98 pushed (carries the Index date fix + Future Planning Drive-scope fix). Only `michael.hoffman@gsa.gov` can repoint the WORK `/exec` deployment, via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) — user action, not agent-doable.
