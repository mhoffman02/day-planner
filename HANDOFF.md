<!-- handoff: branch=worktree-solid-code-pilot worktree=/home/mike/projects/day-planner/.claude/worktrees/solid-code-pilot base=087b767ea52c written=2026-11-04T14:45:45-08:00 -->
# Resume: A6 bug queue shipped (HOME @397); heartbeat hook check and user hand-checks next

> **WARNING: written on branch `worktree-solid-code-pilot`** (worktree `/home/mike/projects/day-planner/.claude/worktrees/solid-code-pilot`), not `pure-gas-main`. Until merged (or pushed with `git push origin HEAD:pure-gas-main`), `pure-gas-main`'s copy is stale. Merge (fast-forward):
> `git -C /home/mike/projects/day-planner pull --ff-only && git -C /home/mike/projects/day-planner merge --ff-only worktree-solid-code-pilot`

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-04T14:45:45-08:00` **and** its parent isn't `087b767ea52c`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline 087b767ea52c..worktree-solid-code-pilot`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** agent work, [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) A6 "Verify the agent-heartbeat PostToolUse hook live": run a short `lite` agent, then `npm run agent:status` and confirm a `.beat` age shows for it (`tools/agent-heartbeat.js`); then add the status-log duty to the `lite`, `worker` and `deep` agent definitions under `~/.claude/agents/`. After that, A5 "shrink `css-baseline.json`" (126 single-use colors left). User-gated, ask together: (1) A6 hand-check on HOME @397 (THREAD show-more, `PreviewLines` 3 to 5, icon-only action row and colors, light and dark); (2) "Update WORK" repoint to v211; (3) optional `PreviewLines` Sheets dropdown (default skip); (4) Phase 32 hand-checks B1.

This session fixed the three A6 bugs in `087b767` (red test first for each): `openDb` in [`src/dailyDataCache.js`](file:///home/mike/projects/day-planner/src/dailyDataCache.js) now retries after a sync `indexedDB.open()` throw; `getWebAppUrl` in [`src/gasBridge.js`](file:///home/mike/projects/day-planner/src/gasBridge.js) and [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) fails loud; `deleteDailyTask` confirmed intentional and documented; and `deploy:home` gained a version guard (`checkVersionCount` in [`tools/lib/version-guard.js`](file:///home/mike/projects/day-planner/tools/lib/version-guard.js), warn 180, fail 200). Gates passed (lint, 1999 tests, live /dev load, axe); HOME @397 deployed, WORK v211 pushed.

- What changed: TODO.md A6 (done items archived to TODO_HISTORY), LEARNINGS 2026-11-04 (A6 bug queue).
- Still open: TODO.md "Agent work" and "For the session after next": A0 (Tutorial walks T09, T10, T14, T16, T18, T20), A5, A6 (heartbeat, user items above), B1/B3/B4 (user present).
- rpc token check, due 2026-11-11: run `npm run rpc -- getHubStatus`; if it still works, drop the 7-day notes in the gas-rpc skill (TODO.md B4).
- Trap: `new Promise` executors run before the outer assignment, so a reset of the outer variable inside one is overwritten. Worktree Bash sometimes refuses compound commands (heredocs, `cd` chains) and always refuses `git -C <other path>`; write scripts and commit messages with the Write tool and run them plain. In `gas-app/*.html` never put `//` in strings.
