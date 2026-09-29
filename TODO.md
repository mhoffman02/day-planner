# Active Tasks (TODO)

Session completed 2026-09-28/29: Phase 21 (full-tab IndexedDB cache port) shipped in full — Master Tasks, Monthly Calendar, and Future Planning tabs now all hydrate-then-revalidate with write-through-on-edit, matching the pattern already built for the Daily tab. Along the way, found and fixed a pre-existing bug where the Monthly Calendar grid only ever showed one day's real events (was reading the single open day's `calendarEvents` instead of the whole visible month), plus a `getMasterTasks` pagination bug (same class as an earlier `getDailyData` fix). Two implementation decisions deviated from `TODO.md`'s literal prior wording, both disclosed and recorded in `PLAN-HISTORY.md`'s Phase 21 entry: kept the `day-planner-cache` DB name (bumped to version 2) instead of renaming to `day-planner-db`; no separate `monthOverview` store (Monthly Calendar reuses the existing per-date `dailyData` store instead). All mirrored into `gas-app/Script.html`, `npm test`/`npm run lint` clean, live-verified via CDP on HOME @274 (build 325). See `PLAN-HISTORY.md`'s Phase 21 entry for full detail, and `TODO_HISTORY.md` for the morning/afternoon 2026-09-28 entries (Quote of the Day, tag-leak fix, Phase 20, daily-nav cache + architect review, Future tab affordance).

No active phase queued. Next macro-task not yet identified — see the loose end below for the only current follow-up.

## Open

_(none — Phase 21 fully shipped)_

## Loose end (unrelated scope, user-blocked)

- [ ] **WORK deployment repoint needed**: WORK version 111 is pushed (`npm run push:work`, this session), carrying every fix now live on HOME through @274/build 325 (full Phase 21 cache port + the two pagination/grid bugs above). Still needs `michael.hoffman@gsa.gov` to repoint via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) — not agent-doable. **Wait for this v111 push specifically**: v108/v109/v110 (already superseded) predate the Phase 21 cache port.
