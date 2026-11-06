<!-- handoff: branch=worktree-beat-key worktree=/home/mike/projects/day-planner/.claude/worktrees/beat-key base=1c29a29775c0 written=2026-11-06T09:27:00-08:00 -->
# Resume: load-speed follow-ups shipped on HOME @416; WORK version 222 awaits your repoint and check

> **WARNING: written on branch `worktree-beat-key`** (worktree `/home/mike/projects/day-planner/.claude/worktrees/beat-key`), pushed to `pure-gas-main`. The main checkout needs `git pull --ff-only` to see it.

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-06T09:27:00-08:00` **and** its parent isn't `1c29a29775c0`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline 1c29a29775c0..origin/pure-gas-main`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** run the agent item A7 "Live check on HOME /dev over CDP" in TODO.md (Show 10/25/50/All, last-run text; `node tools/ensure-chrome.js` + `tools/probe-live.js`). In your first reply also put these user items together: (1) after "Update WORK" (version 222), run the check in [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) A8 on WORK and report; then I run `npm run push:work` again for QW2, QW5 and the Clear button (default: yes); (2) easing scope, see A8 (default: opacity only, 150-200 ms, toasts, popups and late tabs or rows, not the stale-to-fresh list swap); (3) QW6 fonts (default: skip).
This session pushed the hub cache to WORK as version 222, then shipped QW2 (hub tab room reserved on a first visit: `hubTabsPending` in `src/app.js`, placeholders in `gas-app/Index.html`), QW5 (server Doc rows cache 30 min, `DOC_ACTION_CACHE_TTL_S`) and a Clear saved data button (`clearSavedData`, About) on HOME @416 (`90ccb30`). Then `1c29a29` (HOME @417): Task Today/Later spinner and locked Tasked state, quiet success, FYI toast top right. QW4 was measured (`getHubStatus` about 3 s vs 1.2-2 s trivial RPC) and dropped.

- What changed: TODO.md A8 rewritten, TODO_HISTORY 2026-11-06, LEARNINGS 2026-11-06.
- Still open: TODO.md section "Agent work" (A0, A3, A5, A6, A7, A8; hand-check of @417 is in TODO.md A6), and the TODO.md section "For the session after next" (B1/B3/B4, user present).
- rpc token: re-run `npm run rpc -- getHubStatus` on or after 2026-11-11 (due 2026-11-11), TODO.md B4.
- Trap: IndexedDB tests need real timers (`bothClients({ timers })`). In `gas-app/*.html` never put `//` in strings or apostrophes in comments. Changing a cache constant: grep `tests/` for the old value.
