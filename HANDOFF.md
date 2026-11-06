<!-- handoff: branch=worktree-beat-key worktree=/home/mike/projects/day-planner/.claude/worktrees/beat-key base=c8e03d18d4c0 written=2026-11-05T16:43:46-08:00 -->
# Resume: Triage Doc action items shipped (HOME @406, WORK pushed); live checks on WORK next

> **WARNING: written on branch `worktree-beat-key`** (worktree `/home/mike/projects/day-planner/.claude/worktrees/beat-key`), pushed to `pure-gas-main`. The main checkout needs `git pull --ff-only` to see it.

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-05T16:43:46-08:00` **and** its parent isn't `c8e03d18d4c0`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline c8e03d18d4c0..origin/pure-gas-main`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** agent work, [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) A7 "Live check on HOME `/dev` over CDP" (`node tools/ensure-chrome.js`, then `tools/eval-console.js --iframe`; on 2026-11-05 the HOME tab showed a Google OAuth dialog iframe (`createOAuthDialog`) and `plannerApp` was undefined, so if it still does, ask the user to clear it first): last-run text pattern and local time, Show: 10/25/50/All toggle with the "N more hidden" line, `localStorage.dayPlannerDocRowLimit` persists (reset it afterwards). User-gated, ask together: (1) "Update WORK" repoint, then A7 WORK checks: X on a Doc row stays gone about 10 s, Doc rows stay during a Triage refresh, the 240 s budget against 169+ Docs; (2) report whether the "129 items, only showing most recent 50" note still shows 0 rows (untraced; that exact string is not in the source, the app shows `docHidden + ' more hidden'` at `gas-app/Index.html` L1415; `limitDocRows` is in `src/hubUi.js` L152, `docHidden` in `src/app.js` L347 and L1537); (3) optional trim of other raw UTC stamps (default skip); (4) A6 HOME hand-check, B1 live checks.

This session shipped Drive "Follow-up" Doc comments as Triage rows (cache, 200-file cap with 240 s budget, Show limit), the local-time last-run label, and a two-part fix for dismissed rows returning: the server re-reads ledger dismissals after the slow load (`getDocActionItems` in `gas-app/HubController.gs`) and the client keeps a session set (`docDismissedIds`) plus re-merges Doc rows on every board reload (`loadTriageBoard`, `mergeDocRows` in `src/app.js` and `gas-app/Script.html`).

- What changed: TODO.md A7 added, TODO_HISTORY 2026-11-05 (evening), LEARNINGS 2026-11-05 (Triage Doc items).
- Still open: TODO.md A0, A5 (semantic colors, `!important` 123), A6, A7, and "For the session after next" (B1/B3/B4, user present).
- rpc token: re-run `npm run rpc -- getHubStatus` on or after 2026-11-11 (due 2026-11-11), TODO.md B4.
- Trap: slow in-flight RPCs (Doc load up to 240 s) race with dismiss and reload; tests need a gate promise, not instant mocks. Worktree Bash refuses compound commands and `git -C`; in `gas-app/*.html` never put `//` in strings or apostrophes in comments.
