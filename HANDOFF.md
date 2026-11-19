<!-- handoff: branch=priority-two-digit worktree=/home/mike/projects/day-planner/.claude/worktrees/priority-two-digit base=93ee5d810a27 written=2026-11-19T14:39:11-08:00 -->
# Resume: two-digit priorities (B10 to B99) shipped (HOME @517, WORK version 312); next agent work is TODO.md A0 T32-T35

> Written on worktree branch `priority-two-digit` and pushed as `HEAD:pure-gas-main` (one landing path). The main checkout is stale until: `git -C /home/mike/projects/day-planner pull --ff-only`

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-19T14:39:11-08:00` **and** its parent isn't `93ee5d810a27`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline 93ee5d810a27..origin/pure-gas-main`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** TODO.md A0, the bullet "Agent (2026-11-18, next): add T32-T35". Write Tutorial exercises T32 hotkeys, T33 Note it, T34 appointment mail and Calendar icons (Calendar opens a centered window, not a tab), T35 note card height in `gas-app/Tutorial.html`, paste the same text into `index.html`, and add T33 to both places that list the hub exercises: the note (~L123) and the table row "T09 to T15, T19, T20, T27" (~L142). Template and rules are in that A0 section (copy T16 or T30; no `//`, backtick or ASCII apostrophe). Gate: `npm test` (`tests/htmlIncludeMirror.test.js` checks the copy and ID order) then `npm run lint`. The live walk of T21-T35 stays PARKED by the user; do not start it. Skip every line marked user (A6, A7, A10, A11, A12, A14, A17 item 8, A19).

This session lifted the priority cap from 9 to 99 after the user could not type a B10: `parseTaskTitle`, `getNextSequence` and `planRanks` in `src/taskEngine.js` (mirrored into `gas-app/Script.html`), `commitPriority` in `src/app.js`, `TASK_PLANNER_PRIORITY_RE` in `src/integration/taskPlanner.js` (built into `gas-app/Engines.gs`) and the title regex in `gas-app/Code.gs`. It then widened the edit input (`.priority-edit-input`, `3.6ch`) and the Master Tasks Pri column (`.th-w-56`, 56px) when the user asked.

- What changed: TODO_HISTORY.md "2026-11-19 (latest)"; TODO.md A19 (repoint line now says version 312, new hand-check on HOME @517); LEARNINGS.md 2026-11-19 entry.
- Still open: TODO.md A19 (all user: hand-check on HOME @500, repoint WORK `/exec` to version 312, the B10 hand-check on @517, WORK invite subject if RSVP buttons are still missing) plus the older user items in A6, A7, A11, A12, A14, A17 item 8, and "For the session after next" (B1, B3, B4, B5), which needs the user.
- User items, with my recommendation:
  1. Repoint WORK `/exec` to version 312 (only `michael.hoffman@gsa.gov` can). T.
  2. Hand-check on HOME @517: type `B10` into a task's priority box on Today and Master Tasks; it must fit without clipping. The agent did not look at it in a browser. T.
  3. Close any open WORK IDE tab before the agent next runs `push:work`. T.
- Traps: the two-digit change touched five files that each hard-coded the digit class; grep `\[1-9\]` and `1-9` before changing a limit, and grep the widths that show the value. `npm run push:work` fails with "WORK holds build X but build Y was pushed" on a stale push; close the WORK IDE tab and re-run. Compound Bash commands, heredocs, `sed -i` ranges and `cd` are refused or unsafe in a worktree; use Edit or Write, and put scripts in `$CLAUDE_JOB_DIR/tmp`. The mock server runs on `PORT=3411 npm start` from this worktree. `tests/hubUi.test.js` caps `border-radius` at 4px in the hub CSS block.
