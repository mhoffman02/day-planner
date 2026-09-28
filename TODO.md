# Active Tasks (TODO)

Session completed 2026-09-28 (afternoon): stale GAS Docs test mock folded into the Docs Advanced Service model, repo-wide CSS easing/duration token retrofit delegated to `agy` and landed, a new client-side daily-data cache (memory + IndexedDB, `+/-14`-day background prefetch, write-through on edit) shipped to cut day-by-day navigation latency, and a "This Year"/current-month-highlight affordance added to the Future Planning tab (mirroring the Month tab's existing "This Month"/today-highlight) — all verified live on HOME @272 via CDP. See [`TODO_HISTORY.md`](file:///home/mike/projects/day-planner/TODO_HISTORY.md) for details plus the morning's 2026-09-28 entries (Quote of the Day, tag-leak fix, Phase 20, etc).

No active phase — `PLAN.md` has no macro-task queued. Next session should ask the user what to prioritize.

## Open

(none)

## Loose end (unrelated scope, user-blocked)

- [ ] **WORK deployment repoint needed**: WORK version 109 is pushed (`npm run push:work`, this session), carrying every fix now live on HOME through @272 — the Future tab This Year/current-month affordance, the daily-data cache/prefetch, the CSS token retrofit, the Docs test-mock fold, Quote of the Day, the tag-leak fix, and the Tasks-API pagination fix. Still needs `michael.hoffman@gsa.gov` to repoint via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) — not agent-doable.
