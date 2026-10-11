<!-- handoff: branch=worktree-drive-grant-picker worktree=/home/mike/projects/day-planner/.claude/worktrees/drive-grant-picker base=1cf2bcb1a96b written=2026-10-10T21:49:17-07:00 -->
# Resume: Phases 25 + 28 done and archived; only user-gated Phase 30 remains

> **WARNING: written on branch `worktree-drive-grant-picker`**. Commits are also pushed to `origin/pure-gas-main`.
> To update the main checkout: `git -C /home/mike/projects/day-planner pull --ff-only`

**Verify first:** `git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if dated after `2026-10-10T21:49:17-07:00` and its parent isn't `1cf2bcb1a96b`. Then
`git log --oneline 1cf2bcb1a96b..origin/pure-gas-main`.

**Start by:** ask the user which Phase 30 item to take
([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md)): every item needs them (release go, GSA account, decision).

## CURRENT STATE
- HOME `/dev` and the gas-rpc API deployment (@318) run `1cf2bcb`. Pinned prod `/exec` still @297.
- Phase 25 + 28 HOME live checks all passed 2026-10-10 (details in
  [`TODO_HISTORY.md`](file:///home/mike/projects/day-planner/TODO_HISTORY.md)). Four live bugs fixed with red tests:
  failed 🎯/Task ops reach Triage System Exceptions; Advanced Gmail byte bodies decode; error tray Retry no longer
  freezes the app; manifest start_url rewrite.
- Hub flags: GMAIL_ROUTER + TRIAGE_BOARD on, DRY_RUN off, pilot off, TasksListId `@default`, **0 triggers** (removed
  after L8; `installHubTriggers` to go live). Ledger DONE 10.
- CDP Chrome profile (port 9222) is signed in again as of 2026-10-10.
- Tests 863/863, lint clean.

## OPEN THREADS
1. Test appointment "Day Planner e2e test - safe to delete" on HOME calendar 2026-10-30 14:00: user deletes (no RPC).
2. rpc login dies **2026-10-17** (Testing consent screen); remind the user.
3. Meeting Prep error text is the raw engine message ("selectOccurrence: no upcoming occurrence ...") when no series
   occurrence exists; a friendlier empty state is optional polish.

Blocked on the user: everything in Phase 30.

## CONSTRAINTS
- Start replies with `🔋Mike:`. Terse. `file://` links. No globals in `.gs`; fail-loud catches; TDD.
- Commit to working branch, push to `origin/pure-gas-main`. No PRs. `clasp push` to `/dev` pre-authorized; prod needs go.
- Hub test items: Claude sends NEW unique-subject emails to self via Gmail connector and labels them; app stays
  `gmail.readonly`.
- Alpine invokes any binding that evaluates to a function: never bind a function-valued property bare (`x-show="fn"`).
