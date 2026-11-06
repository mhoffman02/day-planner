<!-- handoff: branch=worktree-beat-key worktree=/home/mike/projects/day-planner/.claude/worktrees/beat-key base=4fe63c4460a9 written=2026-11-06T09:52:00-08:00 -->
# Resume: bulk Doc dismiss quota fix live on HOME @418; "last run" auto-refresh awaits your answer

> **WARNING: written on branch `worktree-beat-key`** (worktree `/home/mike/projects/day-planner/.claude/worktrees/beat-key`), pushed to `pure-gas-main`. The main checkout needs `git pull --ff-only` to see it.

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-06T09:52:00-08:00` **and** its parent isn't `4fe63c4460a9`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline 4fe63c4460a9..origin/pure-gas-main`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** run the agent items in TODO.md A7: (1) probe the server trigger, `npm run rpc -- getHubStatus --deploy` (the `--deploy` flag runs @HEAD; read-only on an already-provisioned HOME, it self-provisions if the hub is unprovisioned), and compare `lastRun` (null if none recorded) with `date`; the reply's `triggers` count says whether the hub trigger handlers exist; (2) the "Live check on HOME /dev over CDP" item (Show 10/25/50/All, last-run text; `node tools/ensure-chrome.js` + `tools/probe-live.js`). In your first reply also put these user items together: (a) "last run" refresh, A7 Decide: default a = poll `loadHubStatus()` every 5 min while visible plus on `visibilitychange` (b = 10 min, c = leave); build only after the answer; (b) after "Update WORK" (version 222), the WORK check in A8, then I run `npm run push:work` again for QW2, QW5, the Clear button, Task Today/Later and this quota fix (default: yes); (c) easing scope, A8 (default: opacity only, 150-200 ms); (d) QW6 fonts (default: skip).

This session fixed the Triage error "Quota exceeded: read requests per minute" on bulk Doc-item removal. The old `dismissDocItems` (`gas-app/HubController.gs`) cost about 2N Sheets calls; it now uses one ledger session (1 read, `appendMany`, deduped ids, retryable RATE_LIMITED on a quota error). HOME @418, commit `1566ddc`, 2103 tests, live /dev gate passed. WORK still lacks it.

- What changed: TODO.md A7 (new decide, probe, optional and hand-check items), TODO_HISTORY 2026-11-06 (late), LEARNINGS 2026-11-06 (`4fe63c4`).
- Still open: TODO.md "Agent work" (A0, A3, A5, A6, A7, A8; hand-check of @417 is in A6, the bulk-dismiss check is a WORK check in A7, HOME check skipped by the user) and "For the session after next" (B1/B3/B4, user present).
- rpc token: re-run `npm run rpc -- getHubStatus` on or after 2026-11-11 (due 2026-11-11), TODO.md B4.
- Rule from the user: never single-row or single-cell Sheets reads or writes; always bulk (hundreds of rows). Any new loop over ledger rows needs a session and a call-count test (see `countLedger` in `tests/hubDocActionItems.test.js`).
- Trap: never retry Sheets quota errors with `Utilities.sleep` (holds the script lock). IndexedDB tests need real timers (`bothClients({ timers })`). In `gas-app/*.html` never put `//` in strings or apostrophes in comments.
