<!-- handoff: branch=worktree-beat-key worktree=/home/mike/projects/day-planner/.claude/worktrees/beat-key base=aff529a05ab4 written=2026-11-06T09:01:12-08:00 -->
# Resume: load-speed work shipped on HOME @414 (hub cache in IndexedDB); WORK storage probe is next

> **WARNING: written on branch `worktree-beat-key`** (worktree `/home/mike/projects/day-planner/.claude/worktrees/beat-key`), pushed to `pure-gas-main`. The main checkout needs `git pull --ff-only` to see it.

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-06T09:01:12-08:00` **and** its parent isn't `aff529a05ab4`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline aff529a05ab4..origin/pure-gas-main`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** ask the user to decide / do, together: (1) run the WORK storage probe from [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) A8 on the GSA machine and report `IDB OK` plus whether `day-planner-cache` survives a reload (default: do not run `npm run push:work` until it passes); (2) approve or skip QW2/QW4/QW5/QW6 (default: QW4, split `getHubStatus` into flags-only and slow parts, next); (3) add a "Clear saved data" button on About (default: yes, later). Independent agent work meanwhile: A7 "Live check on HOME /dev over CDP" (Show 10/25/50/All, last-run text).

This session moved the 2-Way Sync out of `doGet` into `runBackgroundSync` after first paint, sent the Triage board and Doc items requests in parallel, and added the IndexedDB hub cache (`src/hubCache.js`, `hydrateHubFromIdb` in `src/app.js`, mirrored in `gas-app/Script.html`). Live on HOME: saved board paints 0.5 s after the frame loads, refresh done about 6 s. WORK does not have it yet.

- What changed: TODO.md A8 added, TODO_HISTORY 2026-11-06, LEARNINGS 2026-11-06.
- Still open: TODO.md A0, A5, A6, A7, A8, and the TODO.md section "For the session after next" (B1/B3/B4, user present).
- rpc token: re-run `npm run rpc -- getHubStatus` on or after 2026-11-11 (due 2026-11-11), TODO.md B4.
- Trap: IndexedDB tests need real timers (`bothClients({ timers })`); the harness immediate timers fire the open timeout at once. In `gas-app/*.html` never put `//` in strings or apostrophes in comments.
