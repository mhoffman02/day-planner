<!-- handoff: branch=worktree-today-rollover-smart-paste worktree=/home/mike/projects/day-planner/.claude/worktrees/today-rollover-smart-paste base=025172fedd30 written=2026-10-30T19:09:19-07:00 -->
# Resume: autonomous agent queue (Phase 31 items 2-3, then Solid Code shrinks); user-gated items are last

> **WARNING: written on branch `worktree-today-rollover-smart-paste`** (worktree
> `/home/mike/projects/day-planner/.claude/worktrees/today-rollover-smart-paste`), not `pure-gas-main`. Every commit
> is pushed to `origin/pure-gas-main` (fast-forward); the main checkout is behind until
> `git -C /home/mike/projects/day-planner pull --ff-only`. `pure-gas-main` is the working branch (CLAUDE.md rule 5).
> `master` has diverged on purpose; don't merge into it.

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-10-30T19:09:19-07:00` **and** its parent isn't `025172fedd30`, or a
worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user.
`git log --oneline 025172fedd30..origin/pure-gas-main`: anything besides the handoff commit landed after this prompt;
check it first.

**Start by (agent work, no user needed):** Phase 31 items 2 and 3 in `TODO.md` section A1, red test first, both
clients. In `executeUniversalSearch` (`src/searchEngine.js` L104; task block ~L143-152): (2) the task snippet shows
the status glyph and the due date or "Undated" (no glyph helper exists yet: take the glyphs the Daily task row
renders, and if they are inline, extract one `taskStatusGlyph` into `src/taskEngine.js` and mirror it); (3) one result per task id across `dailyTasks` + `masterTasks`, keep the first (Daily) copy, and
`targetView` still comes from the task's own fields. Mirror each change in `gas-app/Script.html` (the
`searchEngine` mirror already drifts by one function in `mirror-baseline.json`; do not let the count grow). Then
`npm run deploy:home` (live `/dev` gate), `npm run push:work`, and tell the user "Update WORK".

Queue after that, `TODO.md` under "Agent work" (items A1-A3), all agent-only:
1. A2: `npm run rpc -- runSelfTest` (no `--deploy`). The 7-day rpc token is OVERDUE (was due 2026-10-17; last
   session returned `invalid_grant`). If dead, do not retry; leave "rerun the rpc login" for the user (section B4)
   and go on. Then the HOME `/dev` Forward/Delegate live check with a throwaway task.
2. A3, one `worker` agent per baseline, checker as exit test: shrink `rpc-guard-baseline.json` (46), then
   `html-baseline.json`, then add axe to `deploy:home` (picks 1T 2A 3F, red test first), then `npm run test:mutation`,
   then `mirror-baseline.json` (107), then the legacy `var` suppressions.

**For the session after next (needs the user; do not start in an agent-only session):** `TODO.md` under "For the session after next" (items B1-B4).
1. Phase 32 `Decision:` live checks (a labeled `🎯/Decision` email plus a hub tick; completing a `Decision:` task
   with Today open) and the smart paste + day rollover check.
2. The six portal decisions in `docs/notes-portal-eval.md` (defaults 1A, 2T, 3T, 4A, 5T, 6T).
3. Phase 31 item 1 (`/` already opens universal search; default: `/` focuses the filter only on Master Tasks).
4. Gap 10 cdp-step: the agent proposes a scope before building.
5. Update WORK (repoint after each `push:work`), the rpc login if the token is dead, and the WORK Suggest filters paste.
6. The rest of Phase 30 (test data to delete, WORK live renders, UAT run).

This session: added the Solid Code gates and the stack-out-of-UI fix (HOME @346), queued axe and Gap 10 in
`TODO.md`, and live-verified the Phase 32 conflict flow on HOME @346 through the bridge (throwaway day 2026-01-15; a
leftover section remains in the January notes Doc). `TODO.md` was reordered: "Agent work" first, "For the session
after next" (user-gated) last.

- What changed: `TODO.md` (both new sections), `PLAN.md` Phase 31/32 pointers, `LEARNINGS.md`.
- Traps:
  - Run `npm run push:work` from the repo root; run `clasp push` from `gas-app/`.
  - Stage files by name while a background agent writes.
  - Worktree bash refuses compound commands, `cd`, `$VAR` and heredocs: one command per call, absolute paths,
    `git commit -F <file>`.
  - ESLint flat config replaces `no-restricted-syntax` options per block: repeat shared selectors (`UTC_DAY_KEY`,
    `UNBOUNDED_LOOP`) in the gas-app block of `eslint.config.js`.
  - Live app state from eval-console: `document.querySelector('[x-data]')._x_dataStack[0]` (no `plannerApp` global);
    `.bridge`, `.errorTray`, `.savedNoteByDate` are on it.
  - `saveDailyDocCards` appears twice in `gas-app/Code.gs` by design (IIFE impl ~L2055 plus top-level delegator
    ~L3895).
