# Resume: Daily Notes tag-leak bug fixed and confirmed live — one small cleanup item queued, one user-blocked

**Start by:** if picking up independent work, tackle `TODO.md`'s Open item — `tests/gasDocIdempotency.test.js` still mocks the old `DocumentApp` API the project migrated off of on 2026-09-27; fold it into the newer Docs-Advanced-Service structural-element mock style used by `tests/gasDocsBulletLeak.test.js` (or delete it) so there's one source of truth for GAS Docs-API test coverage. Otherwise ask the user what to prioritize — `PLAN.md` has no queued macro-task.

This session fixed a user-reported bug: Daily Notes on a future date showed `#category: Work` tags leaking into the visible note body, multiplying with each repeat visit. Root cause was a Docs Advanced Service paragraph-bullet-inheritance bug in `buildDaySectionRequests_` (`gas-app/Code.gs`) — it reset paragraph *style* on save but never cleared bullet membership, so `#category: Work` round-tripped as `- #category: Work`, which the client's tag regex didn't match, so it fell into content and a fresh tag got appended on every subsequent save. Fixed with a `deleteParagraphBullets` reset plus a widened client regex so already-corrupted docs self-heal on next save. Also fixed an unrelated `navigateDay()` `toISOString()` timezone-arithmetic violation spotted en route. New regression test added (`tests/gasDocsBulletLeak.test.js`); 157/157 tests and lint clean.

- What changed — `TODO_HISTORY.md`'s top 2026-09-28 entry
- Full technical detail — same entry, or `git log` on commit `2249090`
- Still open — `TODO.md`'s Open section (agent-doable) and Loose end section (user-blocked, below)
- Blocker the next session needs: **WORK deployment repoint**. Version 104 is pushed to WORK, carrying this session's fix plus the prior session's Tasks-API pagination fix — neither is live on WORK yet. Only `michael.hoffman@gsa.gov` can repoint the WORK `/exec` deployment via [Deploy > Manage deployments](https://script.google.com/d/1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq/edit) — not agent-doable.
- HOME is fully deployed and user-confirmed live: `/dev`+`/exec` @266 (build 310).
