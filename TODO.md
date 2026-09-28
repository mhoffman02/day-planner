# Active Tasks (TODO)

Session completed 2026-09-28 (afternoon): stale GAS Docs test mock folded into the Docs Advanced Service model, repo-wide CSS easing/duration token retrofit delegated to `agy` and landed, a new client-side daily-data cache (memory + IndexedDB, `+/-14`-day background prefetch, write-through on edit) shipped to cut day-by-day navigation latency, a "This Year"/current-month-highlight affordance added to the Future Planning tab, and — after the user asked why this diverged from an older, fuller `day-planner-db` IndexedDB design they remembered and preferred — an architect-reviewed pass fixed two real correctness bugs the new cache shipped with (a data-loss race and a prefetch that never actually short-circuited) plus corrected an overclaimed root-cause comment. All verified live on HOME @273 via CDP. User then approved porting the fuller design (Phase 21, in progress — see `PLAN.md`). See [`TODO_HISTORY.md`](file:///home/mike/projects/day-planner/TODO_HISTORY.md) for full details plus the morning's 2026-09-28 entries (Quote of the Day, tag-leak fix, Phase 20, etc).

Active phase: Phase 21 — full-tab IndexedDB cache port (`PLAN.md`). Breakdown below.

## Open

- [ ] **Phase 21 — consolidate onto one IndexedDB (`day-planner-db`), fresh version, stores `dailyData`/`masterTasks`/`monthOverview`/`futureMatrix`.** Rename/migrate off this session's `day-planner-cache` DB. Delete the old, unrelated `day-planner-db` left over from the abandoned `master`-branch lineage (browser-side leftover only, nothing in current code writes to it — safe to just reuse the name fresh).
- [ ] **Phase 21 — Master Tasks tab**: hydrate from IndexedDB on load, then revalidate via `getMasterTasks`; write-through on every master-task mutation (add/update/delete/transfer/move).
- [ ] **Phase 21 — Monthly Calendar tab**: hydrate from IndexedDB on load, then revalidate. Decide whether the existing `getDailyDataRange` can double as the month-batch source or whether a dedicated month-batch endpoint (mine `git show 73c6e7c` for the old `getMonthData` design) is worth adding.
- [ ] **Phase 21 — Future Planning tab**: hydrate from IndexedDB on load, then revalidate via `getFutureMatrix`; write-through on future-item mutations.
- [ ] **Phase 21 — port hardening from the old design**: mine `git show da1b1eb^:src/indexedDbStore.js` for its `onblocked` handling and retry-on-error (`dbPromise = null` on failure) pattern.
- [ ] **Phase 21 — explicitly skip the offline mutation outbox** (still online-only; WORK network access remains the priority over offline, per the 2026-09-09 gas-removal-migration reversal).
- [ ] **Phase 21 — tests, mirror into `gas-app/Script.html`, live-verify via CDP on HOME before the next WORK push.**

## Loose end (unrelated scope, user-blocked)

- [ ] **WORK deployment repoint needed**: WORK version 110 is pushed (`npm run push:work`, this session), carrying every fix now live on HOME through @273. Still needs `michael.hoffman@gsa.gov` to repoint via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) — not agent-doable. **Wait for this v110 push specifically**: v108/v109 (already superseded) carried the caching feature with the two correctness bugs described above still in it.
