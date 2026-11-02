<!-- handoff: branch=worktree-today-rollover-smart-paste worktree=/home/mike/projects/day-planner/.claude/worktrees/today-rollover-smart-paste base=e11f5401018f written=2026-11-01T21:16:24-08:00 -->
# Resume: Phase 33 Solid Code shrinks; next is taskEngine/futureMatrixEngine mutation survivors

> **WARNING: written on branch `worktree-today-rollover-smart-paste`** (a linked worktree), pushed to `pure-gas-main`. The main checkout was pulled by the user (2026-11-01) before this commit, so it is stale again until:
> `git -C /home/mike/projects/day-planner pull --ff-only`

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-01T21:16:24-08:00` **and** its parent isn't `e11f5401018f`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline e11f5401018f..origin/pure-gas-main`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** TODO.md A3 mutation item: write tests that kill the taskEngine (74) and futureMatrixEngine (22) survivors in `stryker.config.json`'s scope (survivor list: `npm run test:mutation` in the background, output to a file, ~10 min, foreground cap is 600 s), then add `src/calendarEngine.js` to `stryker.config.json` (`mutate` and the `commandRunner` test list). Exit test: `npm run lint && npm test`; Stryker has no break threshold (`break: null`), no stored baseline and reports/ is gitignored, so record the before survivor counts from the first run and show them drop (floor: only equivalent mutants remain, as with searchEngine). calendarEngine needs its tests added to the `commandRunner` list. Use a `worker` agent.

This session: earlier Phase 33 shrinks (`var` 0, rpc-guard 0, searchEngine mutation 360 -> 20 equivalent; HOME @360, WORK v187). Then ported `tools/prune-branches.js` to the pure-gas-main base (`7667f94`, lock-aware, tested), pruned merged and junk worktrees/branches (only `master` kept on purpose), retro `e11f540`.

- What changed: `tools/prune-branches.js`, `tests/prune-branches.test.js`, `.agents/commands/prune-branches.md`, LEARNINGS.md. Trackers unchanged: A3 in TODO.md is still the queue.
- Still open, agent work: the mutation item above. html 12 and mirror 72 are baselined by user decision (leave).
- Still open, user-gated (TODO.md "For the session after next"; do not start in an agent-only session): B1, B3, B4.
- **Update WORK**: WORK v187 awaits the user's repoint of "Day Planner v1" in the WORK IDE.
- Unverified live: the `getFutureMatrix` bad-arg guard (`npm run rpc` probe hit Execution API 429 on 2026-11-01; retry once quota resets, `--deploy` if the API deployment is stale). On a `ValidationError`, delete this line in a doc-only commit.
- Traps: `v_` guards are positional, so declare every argument. Run each git command separately in a worktree; the sandbox refuses `git -C <other path>`. `prune-branches` misclassifies cherry-picked branches as unmerged.
