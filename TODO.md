# Active Tasks (TODO)

Session completed 2026-09-28: see [`TODO_HISTORY.md`](file:///home/mike/projects/day-planner/TODO_HISTORY.md)'s 2026-09-28 entries for what shipped (Index date-column fix, Future Planning Drive-scope bug fixed live; Phase 19 closed — `drive.readonly` kept as-is, WORK repointed to version 92 and user-confirmed; WORK parity verified @91, voice typing popup polish, notes empty-state, Monthly Calendar today-highlight, About.html rewrite).

## Phase 20: Future Planning Items as Real Tasks

See `PLAN.md`'s Phase 20 for full rationale (born from a 2026-09-28 live bug: `DriveApp.Folder.createFile()` demanded broad `drive` scope even for the app's own folder — patched for now, but the real fix is moving Future Planning off Drive-file storage onto the Tasks API).

- [x] Rework `addFutureItem`/`updateFutureItemStatus`/`transferFutureItem`/`pushFutureItemToNextMonth`/`deleteFutureItem` in `gas-app/Code.gs` to operate on Tasks (dueDate-keyed, flagged `[Future]`) instead of the JSON bucket.
- [x] Rework `getFutureMatrixData_`/`getFutureMatrix` to query Tasks and group by `dueDate`'s month.
- [x] When a new item has no specific day, default `dueDate` to the last day of the target month.
- [x] Client side (`src/futureMatrixEngine.js`, `src/app.js`, `gas-app/Script.html`, `Index.html`) needed no changes — RPC contract unchanged. `npm test` (155/155) and `npm run lint` confirmed clean.
- [x] Migration: user chose "start fresh" — no import, old `future-matrix-*.json` files left orphaned in Drive.
- [x] Verify live (HOME @262): no-day item landed on 2026-09-30 (last day of the month); status cycling (•→○) and delete confirmed round-trip against real Google Tasks (probed live via CDP, test item cleaned up after).
- [ ] Verify live on WORK once repointed (see loose end below) — HOME parity check only so far.

## Loose end (unrelated scope, user-blocked)

- [ ] **WORK deployment repoint**: version 99 pushed (carries Phase 20's Future Planning Tasks-API rewrite, on top of the earlier Index date fix + Drive-scope fix). Only `michael.hoffman@gsa.gov` can repoint the WORK `/exec` deployment, via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) — user action, not agent-doable.
