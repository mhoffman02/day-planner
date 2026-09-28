# Active Tasks (TODO)

Session completed 2026-09-28: see [`TODO_HISTORY.md`](file:///home/mike/projects/day-planner/TODO_HISTORY.md)'s 2026-09-28 entries for what shipped (Daily Notes `#category` tag-leak bug fixed and user-confirmed live on HOME @266; Phase 20 complete — Future Planning items now stored as real Google Tasks; code-review follow-up fixed a real Tasks-API pagination bug; Index date-column fix, Future Planning Drive-scope bug fixed live; Phase 19 closed — `drive.readonly` kept as-is, WORK repointed to version 92 and user-confirmed; WORK parity verified @91, voice typing popup polish, notes empty-state, Monthly Calendar today-highlight, About.html rewrite).

No active phase — `PLAN.md` has no macro-task queued. Next session should ask the user what to prioritize.

## Open

- [ ] **Stale GAS Docs test mock**: `tests/gasDocIdempotency.test.js` mocks the old `DocumentApp` API, which the project migrated off of on 2026-09-27 in favor of the Docs Advanced Service (`Docs.Documents.get`/`batchUpdate`). It can no longer catch regressions in the real `buildDaySectionRequests_`/`docsGetBodyElements_` implementation — the bullet-inheritance bug (below) shipped straight through it, and only got a regression test via a separate new file (`tests/gasDocsBulletLeak.test.js`). Either delete the stale `DocumentApp` mock tests or fold them into the newer structural-element mock style so there's one source of truth for GAS Docs-API test coverage.

## Loose end (unrelated scope, user-blocked)

- [ ] **WORK deployment repoint needed**: WORK version 104 is pushed, carrying two fixes not yet live on WORK — (1) the Daily Notes `#category` tag-leak bug (bullet-inheritance in `buildDaySectionRequests_`, user-confirmed fixed on HOME @266) and (2) the prior session's Tasks-API pagination fix for `getFutureMatrixData_`. Still needs `michael.hoffman@gsa.gov` to repoint via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) — user action, not agent-doable.
