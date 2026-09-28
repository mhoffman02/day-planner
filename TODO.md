# Active Tasks (TODO)

Session completed 2026-09-28: see [`TODO_HISTORY.md`](file:///home/mike/projects/day-planner/TODO_HISTORY.md)'s 2026-09-28 entries for what shipped (Phase 20 complete — Future Planning items now stored as real Google Tasks; code-review follow-up fixed a real Tasks-API pagination bug; both live-verified on HOME @263; Index date-column fix, Future Planning Drive-scope bug fixed live; Phase 19 closed — `drive.readonly` kept as-is, WORK repointed to version 92 and user-confirmed; WORK parity verified @91, voice typing popup polish, notes empty-state, Monthly Calendar today-highlight, About.html rewrite).

No active phase — `PLAN.md` has no macro-task queued. Next session should ask the user what to prioritize.

## Loose end (unrelated scope, user-blocked)

- [x] WORK deployment repointed by `michael.hoffman@gsa.gov` to (approximately) version 99 and user-confirmed live — Future Planning items correctly surface in Today/Master Tasks on WORK.
- [ ] **New WORK deployment repoint needed**: a same-session code-review pass (after the above repoint/verification) caught and fixed a real bug — `getFutureMatrixData_` requested `maxResults: 200` from the Tasks API, which actually caps at 100/page with no pagination, so any year with 100+ due-dated tasks could have silently dropped Future items. Fixed with a `nextPageToken` pagination loop (also clamped the unused `addFutureItem` `day` param to a valid day-of-month). WORK version 102 is pushed with this fix (build number auto-stamp only bumped it from 101); still needs `michael.hoffman@gsa.gov` to repoint via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) — user action, not agent-doable.
