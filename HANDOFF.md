<!-- handoff: branch=worktree-today-rollover-smart-paste worktree=/home/mike/projects/day-planner/.claude/worktrees/today-rollover-smart-paste base=f6437960baad written=2026-11-02T07:54:36-08:00 -->
# Resume: Phase 33 mutation survivors done; nothing agent-doable left, ask the user to decide

> **WARNING: written on branch `worktree-today-rollover-smart-paste`** (a linked worktree), pushed to `pure-gas-main`. The main checkout is stale until:
> `git -C /home/mike/projects/day-planner pull --ff-only`

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-02T07:54:36-08:00` **and** its parent isn't `f6437960baad`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline f6437960baad..origin/pure-gas-main`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** ask the user to decide: (1) where the global skills in `~/.claude/skills` (solid-code, init-project; not a git repo) get pushed: a new private `claude-skills` repo rooted there (recommended), inside the day-planner repo, or nowhere; do not create a repo or push before the answer. (2) Whether to start B1/B3/B4 (TODO.md "For the session after next") with the user present.

This session: chased Stryker survivors with tier agents. taskEngine 74 -> 24, futureMatrixEngine 22 -> 10, calendarEngine added to Stryker 134 -> 6; every survivor left is argued equivalent (`67fe9d1`, `f643796`). The chase found a real bug, fixed test-first: `sanitizeDescriptionHtml` skipped `target`/`rel` on anchors with `data-target` (`44d87db`). Local-only skill edits: solid-code step 12 "Rules" plus `templates/rules/*`, a survivor-chase note in step 7, and init-project runs solid-code by default (GAS rules offered as an optional ask).

- What changed: `stryker.config.json`, `tests/mutationKillers.test.js`, `tests/calendarMutationKillers.test.js`, `src/calendarEngine.js`; PLAN.md Phase 33, TODO.md A3, TODO_HISTORY.md, LEARNINGS.md.
- Still open, agent work: none. html 12 and mirror 72 are baselined by user decision (leave).
- Still open, user-gated (TODO.md "For the session after next"; do not start in an agent-only session): B1, B3, B4.
- **Update WORK**: WORK v187 awaits the user's repoint of "Day Planner v1" in the WORK IDE. This session changed no gas-app file, so no new deploy.
- Unverified live: the `getFutureMatrix` bad-arg guard (`npm run rpc` probe hit Execution API 429 on 2026-11-01; retry once quota resets, `--deploy` if the API deployment is stale). On a `ValidationError`, delete this line in a doc-only commit.
- Traps: `v_` guards are positional, so declare every argument. Run each git command separately in a worktree; the sandbox refuses compound git and `git -C <other path>`. Parallel Stryker runs need distinct `--tempDirName`; a combined run can exceed the 600 s foreground cap, so run per file in the background. `prune-branches` misclassifies cherry-picked branches as unmerged.
