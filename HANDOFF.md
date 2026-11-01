<!-- handoff: branch=worktree-today-rollover-smart-paste worktree=/home/mike/projects/day-planner/.claude/worktrees/today-rollover-smart-paste base=098b12831f64 written=2026-11-01T13:57:36-08:00 -->
# Resume: Phase 33 Solid Code shrinks, last agent items (var 1, mutation, rpc-guard); user-gated B1-B4 are last

> **WARNING: written on branch `worktree-today-rollover-smart-paste`** (worktree
> `/home/mike/projects/day-planner/.claude/worktrees/today-rollover-smart-paste`), not `pure-gas-main`. Every commit
> is pushed to `origin/pure-gas-main` (fast-forward); the main checkout is behind until
> `git -C /home/mike/projects/day-planner pull --ff-only`. `pure-gas-main` is the working branch (CLAUDE.md rule 5).
> `master` has diverged on purpose; don't merge into it.

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-01T13:57:36-08:00` **and** its parent isn't `098b12831f64`, or a
worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user.
`git log --oneline 098b12831f64..origin/pure-gas-main`: anything besides the handoff commit landed after this prompt;
check it first.

**Start by (agent work, no user needed):** `TODO.md` A3, in order, one `worker` agent per item with its checker as the
exit test: (1) the last `var`: `primaryTzMemo_` in `gas-app/Code.gs` (~L1461, read by `primaryCalendarTimeZone_` at ~L1472):
it sits OUTSIDE the file's IIFE (the top-level delegator block), so it is a real global; move it inside the IIFE as a
private `let` with `primaryCalendarTimeZone_` there (`.agents/rules/gas-global-init-order.md`), red test first, then
`npx eslint --prune-suppressions gas-app/Code.gs` (used successfully this session); (2) mutation 96 survivors: widen
`stryker.config.json` (add `src/searchEngine.js` to `mutate` AND `tests/searchEngine.test.js` to the `commandRunner` test
list, line ~6), turn survivors into tests; (3) rpc-guard 26: `v_` only on non-user-facing args, then
`node tools/check-rpc-guards.js --update`. Gas-app change → `npm run deploy:home` (never during a live eval-console
check), then once at the end `npm run push:work` (ONE push per session) and tell the user "Update WORK".

This session: verified Master Delegate Undo live (no bug); found the axe gate audited Google's wrapper frame, not the app
(`db132de`), fixed the 5 real violations (`31b0a8a`, `tests/a11yMarkup.test.js`), `axe-baseline.json` is now `{}`;
rpc-guard 28 → 26 (trigger handlers excluded); Haiku agents removed 695 of 696 legacy `var` (`52c827f`, `098b128`).
HOME @357, WORK v186 pushed, repoint pending. Created the `/kontinue` skill (alias for `/do-handoff`).

- What changed: `TODO.md` A3 rewritten (A1/A2 archived to `TODO_HISTORY.md`); `PLAN.md` Phase 31 archived, Phase 33 added.
- Still open (agent): A3 above plus html 12/page and mirror 72, both decided to leave (user 2026-11-01).
- Still open (user), `TODO.md` section "For the session after next": B1 (Phase 32 live checks, notes-portal agent work already approved), B3 (Gap 10 "build it"?),
  B4 (Update WORK repoint: IDE near the 200-version cap; test data cleanup; WORK live checks; UAT T01-T20).
- Traps:
  - `var` removal changed top-level `var` to `const`/`let` in `.gs`; the deploy gate loads only the main app, so Regrant and SetupFolder pages are not exercised by it. Spot-check them in the browser when convenient.
  - A lite agent cannot find live-only axe violations; print node targets first (`axe.run` results, one-off CDP script).
  - `npm run rpc` without `--deploy` runs the PINNED API version (old code). A deploy does not reload the CDP tab: run eval-console with `location.reload()` first.
  - Never `pkill -f eval-console` from a command that mentions it. A deploy reloads the live tab: never deploy during a live check.
  - Worktree bash refuses compound commands, `cd`, `$VAR` and heredocs in some forms: one command per call, absolute paths, `git commit -F <file>`.
  - Live app state: `document.querySelector('[x-data]')._x_dataStack[0]` (`.bridge`, `.saveQueue`).
  - Stryker scope is only `taskEngine.js` + `futureMatrixEngine.js` (`stryker.config.json`).
  - `saveDailyDocCards` appears twice in `gas-app/Code.gs` by design (IIFE impl plus top-level delegator).
