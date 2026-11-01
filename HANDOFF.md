<!-- handoff: branch=worktree-today-rollover-smart-paste worktree=/home/mike/projects/day-planner/.claude/worktrees/today-rollover-smart-paste base=cd19fe6d7f58 written=2026-11-01T13:14:24-08:00 -->
# Resume: A2 retest + remaining Solid Code shrinks (agent); user-gated items B1-B4 are last

> **WARNING: written on branch `worktree-today-rollover-smart-paste`** (worktree
> `/home/mike/projects/day-planner/.claude/worktrees/today-rollover-smart-paste`), not `pure-gas-main`. Every commit
> is pushed to `origin/pure-gas-main` (fast-forward); the main checkout is behind until
> `git -C /home/mike/projects/day-planner pull --ff-only`. `pure-gas-main` is the working branch (CLAUDE.md rule 5).
> `master` has diverged on purpose; don't merge into it.

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-01T13:14:24-08:00` **and** its parent isn't `cd19fe6d7f58`, or a
worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user.
`git log --oneline cd19fe6d7f58..origin/pure-gas-main`: anything besides the handoff commit landed after this prompt;
check it first.

**Start by (agent work, no user needed):** `TODO.md` section A2, "Master Delegate Undo": on HOME `/dev`, with a
throwaway Master task and NO deploy during the run (a deploy reloads the tab and kills in-flight writes), Delegate then
Undo, wait for `saveQueue.busy('task-status:<id>')` to clear, then read `getMasterTasks()`. Two earlier runs ended at
Ⓓ (unconfirmed, probably killed writes). If it still ends Ⓓ, it is a bug: red test first in `undoForward`
(`src/app.js` / `gas-app/Script.html`), both clients. Delete the throwaway. Then the A3 items that need no decision:
fix the 4 axe violations (`document-title`, `html-has-lang`, `landmark-one-main`, `page-has-heading-one`; then
`npm run deploy:home -- --check --update-axe`), exclude trigger handlers (`onOpen(e)`) from `tools/check-rpc-guards.js`,
and `eslint --fix` the remaining `var` files. Each as a `worker` agent with its checker as exit test. Gas-app change
→ `npm run deploy:home`, then once at the end `npm run push:work` (ONE push per session)
and tell the user "Update WORK".

**Needs a user decision before an agent can do it (A3 leftovers):** rpc-guard 28 (hub, Future-matrix, friendly-error
RPCs: v_ throw vs friendly message; default: keep friendly messages, guard with `v_` only on non-user-facing args);
mirror 72 (which copy wins for `dp*` helper names and diverged logic like `parseDailyNoteToCards`; default: GAS side wins,
leave them baselined); html 12 per page (radio/listbox/progressbar restructure; default: leave).

**For the session after next (needs the user; do not start in an agent-only session):** `TODO.md` items B1, B3, B4 (B2 shipped).
1. B1: Phase 32 live checks (label an email `🎯/Decision` + a hub tick; complete a `Decision:` task with Today open;
   delete the leftover 2026-01-15 section in the "Day Planner Notes - January 2026" Doc); six portal decisions in
   `docs/notes-portal-eval.md` (defaults 1A 2T 3T 4A 5T 6T); smart paste + midnight rollover check.
2. B2 (`/` focus) shipped, HOME @352.
3. B3: Gap 10 cdp-step scope (the agent proposes).
4. B4: Update WORK (repoint to the newest version, delete old versions: IDE near the 200 cap); delete the "Day Planner
   e2e test - safe to delete" calendar event and the Hub L6 test email/task; WORK live checks; UAT T01-T20; WORK Suggest
   filters paste; WORK forwards made before v149. rpc login not needed (token alive).

This session: shipped Phase 31 items 2-3, A2 live checks (Daily verified; Master Delegate Undo open), and six
Solid Code shrinks: rpc-guard 46→28, html 21→12/page, axe gate in `deploy:home`, mutation 67%→91%, mirror 107→72,
`var` 858→696. HOME @355: `/` focuses the Master filter, header Refresh reloads all views (`refreshAll`), Decision notes are a blue tag + left rule; WORK v185 pushed, repoint pending. User decisions 2-6 recorded in TODO.md; Gap 10 scope proposed there, awaiting "build it".

- What changed: `TODO.md` A2/A3 rewritten to what is left; `TODO_HISTORY.md` 2026-11-01 entry; `PLAN.md` Phase 31 pointer.
- Traps:
  - `npm run rpc` without `--deploy` runs the PINNED API version (old code); pass `--deploy` to test current code. A deploy does not reload the CDP tab: run eval-console with `location.reload()` first, then check `typeof a.refreshAll`.
  - Never `pkill -f eval-console` from a command that mentions it (kills its own shell).
  - A deploy reloads the live tab: never deploy during an eval-console live check.
  - Run `npm run push:work` once per session; it creates a WORK version each time.
  - Worktree bash refuses compound commands, `cd`, `$VAR` and heredocs in some forms: one command per call, absolute
    paths, `git commit -F <file>`.
  - Live app state: `document.querySelector('[x-data]')._x_dataStack[0]` (`.bridge`, `.saveQueue`); slow eval calls need
    `run_in_background`.
  - Stryker scope is only `taskEngine.js` + `futureMatrixEngine.js` (`stryker.config.json`).
  - `saveDailyDocCards` appears twice in `gas-app/Code.gs` by design (IIFE impl plus top-level delegator).
