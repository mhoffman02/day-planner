<!-- handoff: branch=worktree-drive-grant-picker worktree=/home/mike/projects/day-planner/.claude/worktrees/drive-grant-picker base=906159dee30a written=2026-10-10T20:25:51-07:00 -->
# Resume: Phase 29 done and archived; next is Phase 28 live /dev checks

> **WARNING: written on branch `worktree-drive-grant-picker`**. Commits are also pushed to `origin/pure-gas-main`.
> To update the main checkout: `git -C /home/mike/projects/day-planner pull --ff-only`

**Verify first:** `git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if dated after `2026-10-10T20:25:51-07:00` and its parent isn't `906159dee30a`. Then
`git log --oneline 906159dee30a..origin/pure-gas-main`.

**Start by:** Phase 28 live `/dev` checks via `tools/ensure-chrome.js` + `tools/e2e/*`
([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md), Phase 28 section).

## CURRENT STATE
- Phase 29 live exit passed on HOME 2026-10-10 (gas-rpc @312): 3 fresh items -> **1 read, 4 writes** (baseline 4/6),
  3 Tasks created, ledger DONE 6 -> 9. Archived to [`PLAN-HISTORY.md`](file:///home/mike/projects/day-planner/PLAN-HISTORY.md).
- Tests 854/854, lint clean.

## OPEN THREADS
1. Phase 28 live `/dev` checks (TODO.md Phase 28 section).
2. 7-day Testing expiry watch / publish the consent screen (user decision); rpc login dies **2026-10-17**.

Blocked on the user: pinned prod `/exec` deploy and WORK promotion (user go); WORK `/exec` repoint (GSA account only).

## CONSTRAINTS
- Start replies with `🔋Mike:`. Terse. `file://` links. No globals in `.gs`; fail-loud catches; TDD.
- Commit to working branch, push to `origin/pure-gas-main`. No PRs. `clasp push` to `/dev` pre-authorized; prod needs go.
- Hub test items: Claude sends NEW unique-subject emails to self via Gmail connector and labels them; the app stays
  `gmail.readonly`.
