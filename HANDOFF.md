<!-- handoff: branch=worktree-today-rollover-smart-paste worktree=/home/mike/projects/day-planner/.claude/worktrees/today-rollover-smart-paste base=da66a4f21c84 written=2026-10-30T14:14:31-07:00 -->
# Resume: Phase 32 live check on HOME (@346), then Phase 31 items 2-3; Solid Code gates shipped

> **WARNING: written on branch `worktree-today-rollover-smart-paste`** (worktree
> `/home/mike/projects/day-planner/.claude/worktrees/today-rollover-smart-paste`), not `pure-gas-main`. Every commit
> is pushed to `origin/pure-gas-main` (fast-forward); the main checkout is behind until
> `git -C /home/mike/projects/day-planner pull --ff-only`. `pure-gas-main` is the working branch (CLAUDE.md rule 5).
> `master` has diverged on purpose; don't merge into it.

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-10-30T14:14:31-07:00` **and** its parent isn't `da66a4f21c84`, or a
worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user.
`git log --oneline da66a4f21c84..origin/pure-gas-main`: anything besides the handoff commit landed after this prompt;
check it first.

**Start by:** live-check Phase 32 on HOME `/dev` with `node tools/ensure-chrome.js` + `tools/eval-console.js` /
`tools/read-console.js` (never a generic browser tool). Use a throwaway day (not today) in the October notes Doc:
1. Type a line in the app for that day and wait for the save.
2. Add a line to that day directly in the Google Doc.
3. Type again in the app (without reloading). Expect a save error saying "changed in Google Docs" with Retry, and the
   Doc line to survive. Press Retry in the error tray (`gas-app/Index.html` ~L309; message from `saveDailyNote` in
   `gas-app/Script.html` ~L5773): the app text replaces the Doc section. `saveDailyDocCards` appears twice in
   `gas-app/Code.gs` by design: the impl inside the IIFE (~L2055) and its top-level delegator (~L3895).

Then mark the Phase 32 live-check item in `TODO.md` and go to Phase 31 items 2-3 (agent work, red test first, both
clients).

This session added Solid Code gates (HOME @346 live-gated, WORK version pushed, the user must repoint it). Pre-commit
and `npm run lint` now enforce ESLint 2T on `.js`/`.gs`/gas-app html scripts, local date keys, GAS globals, RPC-guard
and mirror ratchets, x-html via sanitizers, no pill radii, and no `.stack` outside loggers. Commit-msg needs
`Red-run:` (+ `Escaped-because:`/`Guard-added:` on fix, `Measured:` on perf). Full list: `.agents/rules/solid-code.md`.
`npm run deploy:home` is the only way to move HOME v1 (live `/dev` load).

- What changed: `TODO_HISTORY.md` 2026-10-30 Solid Code entry; `TODO.md` "Solid Code ratchets" section.
- Still open, agent work (in order):
  1. Phase 32 HOME live check: the conflict check above, plus a `Decision:` task completion with Today open.
     `🎯/Decision` routing needs a labeled email and a hub tick on HOME.
  2. Live check smart paste + day rollover (`TODO.md` Phase 32).
  3. Phase 31 items 2 (status + due in search task results) and 3 (dedupe by task id, keep the Daily copy first).
  4. Phase 30: run `npm run rpc -- runSelfTest` without `--deploy`. The 7-day rpc token is OVERDUE (was due
     2026-10-17; last session it returned `invalid_grant`); if dead, the user reruns the rpc login. Then the HOME
     `/dev` live checks.
  5. `TODO.md` "Solid Code ratchets": shrink rpc-guard (46), mirror (107), html, legacy `var` baselines; run Stryker.
- Still open, user-gated:
  - Update WORK.
  - The six portal decisions in `docs/notes-portal-eval.md`. Defaults: 1A, 2T, 3T, 4A, 5T, 6T.
  - Phase 31 item 1 (`/` already opens universal search; default: `/` focuses the filter only on Master Tasks).
  - WORK: run About > **Suggest filters** and paste the Filter Suggestions tab.
- Traps:
  - Run `npm run push:work` from the repo root; run `clasp push` from `gas-app/`.
  - Stage files by name while a background agent writes.
  - Worktree bash refuses compound commands, `cd`, `$VAR` and heredocs: one command per call, absolute paths,
    `git commit -F <file>`.
  - ESLint flat config replaces `no-restricted-syntax` options per block: repeat shared selectors (`UTC_DAY_KEY`,
    `UNBOUNDED_LOOP`) in the gas-app block of `eslint.config.js`.
