<!-- handoff: branch=worktree-today-rollover-smart-paste worktree=/home/mike/projects/day-planner/.claude/worktrees/today-rollover-smart-paste base=172ed4b6170d written=2026-10-30T09:52:59-07:00 -->
# Resume: Phase 32 live check on HOME (safe note saves + Decisions @340), then Phase 31 items 2-3

> **WARNING: written on branch `worktree-today-rollover-smart-paste`** (worktree
> `/home/mike/projects/day-planner/.claude/worktrees/today-rollover-smart-paste`), not `pure-gas-main`. Every commit
> is pushed to `origin/pure-gas-main` (fast-forward); the main checkout is behind until
> `git -C /home/mike/projects/day-planner pull --ff-only`. `pure-gas-main` is the working branch (CLAUDE.md rule 5).
> `master` has diverged on purpose; don't merge into it.

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-10-30T09:52:59-07:00` **and** its parent isn't `172ed4b6170d`, or a
worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user.
`git log --oneline 172ed4b6170d..origin/pure-gas-main`: anything besides the handoff commit landed after this prompt;
check it first.

**Start by:** live-check Phase 32 on HOME `/dev` with `node tools/ensure-chrome.js` + `tools/eval-console.js` / `tools/read-console.js`
(never a generic browser tool). Use a throwaway day (not today) in the October notes Doc:
1. Type a line in the app for that day and wait for the save.
2. Add a line to that day directly in the Google Doc.
3. Type again in the app (without reloading). Expect a save error saying "changed in Google Docs" with Retry, and the Doc line to
   survive. Press Retry: the app text replaces the Doc section.

Then mark the Phase 32 live-check item in `TODO.md` and go to Phase 31 items 2-3 (agent work, red test first, both
clients).

This session shipped (HOME @340, WORK version pushed, the user must repoint it):
- Today rollover and smart paste.
- The About Hub Config Drive-search link.
- Revision-safe note saves. `saveDailyDocCards` in `gas-app/Code.gs` (~L2055; the ~L3895 copy is the delegator) takes a client baseline, returns `conflict` and
  sends `writeControl`. The client handles this in `saveDailyNote`/`adoptDocNoteBaseline` in `src/app.js` + Script.html.
- Fixed a bug where a typed `## ` line split a day section (`isPlainDayHeadingText_`).
- Decisions:
  - `🎯/Decision` creates an undated `Decision: <subject>` Task (`collectItems_`/`executeRoute` in
    `gas-app/QueueProcessor.gs`).
  - Note lines show a `#decision` badge (`renderCardLine`).
  - Completing a `Decision:` task appends `#decision <what>` to the last note card of today (`logCompletedDecision`).
- Architect evals are in `docs/notes-doc-embed-eval.md`, `docs/notes-portal-eval.md` and `docs/key-decisions-eval.md`.

- What changed: `TODO_HISTORY.md` 2026-10-30; `PLAN.md` Phase 32; `TODO.md` Phase 32.
- Still open, agent work (in order):
  1. Phase 32 HOME live check: the conflict check above, plus a `Decision:` task completion with Today open.
     `🎯/Decision` routing needs a labeled email and a hub tick on HOME.
  2. Live check smart paste + day rollover (HOME @337; `TODO.md` Phase 32).
  3. Phase 31 items 2 (status + due in search task results) and 3 (dedupe by task id, keep the Daily copy first).
  4. Phase 30: run `npm run rpc -- runSelfTest` without `--deploy`. The 7-day rpc token is OVERDUE (was due
     2026-10-17); if the token is dead, the user reruns the rpc login. Then the HOME `/dev` live checks.
- Still open, user-gated:
  - Update WORK.
  - The six portal decisions in `docs/notes-portal-eval.md`. Defaults: 1A, 2T, 3T, 4A, 5T, 6T. 5T is a fail-loud
    guard for notes Docs with more than one tab, a latent data-loss path.
  - Phase 31 item 1 (`/` already opens universal search; default: `/` focuses the filter only on Master Tasks).
  - WORK: run About > **Suggest filters** and paste the Filter Suggestions tab.
- Decision 5 from the user is recorded as: a decision is a Task whose title or notes lead with `Decision:`; no register
  view or `[Decision]` tag. The matcher strips a priority code first (`[A1] Decision: x`).
- Traps:
  - Run `npm run push:work` from the repo root. From `gas-app/` it fails with a misleading permission error.
  - Run `clasp push` from `gas-app/`.
  - Stage files by name while a background agent writes docs.
