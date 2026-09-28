# Active Tasks (TODO)

Session completed 2026-09-28: see [`TODO_HISTORY.md`](file:///home/mike/projects/day-planner/TODO_HISTORY.md)'s 2026-09-28 entry for what shipped (WORK parity verified @91, voice typing popup polish, notes empty-state, Monthly Calendar today-highlight, About.html rewrite).

## Phase 19: `drive.readonly` Scope Narrowing

- [ ] **1. Audit call sites**: confirm exactly which RPC functions use the `drive.readonly` scope (`resolveDriveFileTitle` and any others) in `gas-app/Code.gs`.
- [ ] **2. Get user go-ahead**: this is a deliberate, lower-urgency cleanup, not a bug fix — confirm the narrowing approach with the user before touching `gas-app/appsscript.json`.
- [ ] **3. Apply the Phase 18 pipeline**: if approved, port affected call sites to a narrower scope/service, verify against a revoked-and-re-consented OAuth grant, promote to WORK, get user confirmation live.
