<!-- handoff: branch=pure-gas-main worktree=main-checkout base=3128f232fbe0 written=2026-10-12T08:26:19-07:00 -->
# Resume: config cleanup done; every open item is user-gated (Phase 30)

> `pure-gas-main` is the project's working branch (CLAUDE.md rule 5). `master` has diverged on purpose since
> 2026-08-16, so don't merge into it.

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
This prompt is stale if that commit is dated after `2026-10-12T08:26:19-07:00` **and** its parent (2nd field) isn't
`3128f232fbe0`, or if `git worktree list` shows a worktree whose `HANDOFF.md` stamp has a later `written=`. If it's
stale, read `git show <1st field>:HANDOFF.md`, use that instead, and tell the user. Then run
`git log --oneline 3128f232fbe0..origin/pure-gas-main`. Any commit there besides the handoff commit is work that landed
after this prompt.

**Start by:** asking the user to decide:
- (a) Is the WORK repoint done? The user does it in the WORK IDE as `michael.hoffman@gsa.gov`: Services (+) Gmail +
  Sheets, then deploy v132. If it's done, run the WORK Meeting Prep render check.
- (b) Install the hub trigger now (`installHubTriggers`)? Default: no. It makes the 5-minute queue act on real Gmail.
- (c) What should the next phase be? There's no agent work queued.

On 2026-10-17, rerun the rpc login and check the web app and sync trigger still authorize (7-day Testing expiry).

**This session:** the local checkout was 9 commits behind origin; it's now up to date.
- Committed `3128f23`:
  - The three GAS rules now carry `paths: ["gas-app/**"]`, so they load only for `gas-app/` work.
  - The `esm-rules` skill description is quoted; it was invalid YAML. The file now uses LF line endings.
  - `CLAUDE.md` loses its stale codebase-structure section.
- Dropped two superseded stashes.
- Archived the done Phase 30 TODO items (prod @319, consent stays in Testing) to `TODO_HISTORY.md`.

- Still open: [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) Phase 30, all user-gated. That covers the
  WORK repoint, the WORK Meeting Prep render, the expiry watch, the hub trigger, and test-data cleanup (one test
  appointment, the L6 test email and its Task, and the 10-30 and 10-31 Daily Notes sections).
- Plan: [`PLAN.md`](file:///home/mike/projects/day-planner/PLAN.md) §3 Phase 30.
