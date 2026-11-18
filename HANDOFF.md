<!-- handoff: branch=a18-a0 worktree=/home/mike/projects/day-planner/.claude/worktrees/a18-a0-tutorial base=c3a899795114 written=2026-11-18T10:00:04-08:00 -->
# Resume: Note it day fix, appointment mail/chat icons and note card resize shipped (HOME @502, WORK pushed); next agent work is TODO.md A0 (Tutorial T21+)

> Written on worktree branch `a18-a0` and pushed as `HEAD:pure-gas-main` (one landing path). The main checkout is stale until: `git -C /home/mike/projects/day-planner pull --ff-only`

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-18T10:00:04-08:00` **and** its parent isn't `c3a899795114`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline c3a899795114..origin/pure-gas-main`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** TODO.md A0 (agent, in progress, PLAN Phase 36). T21-T31 are written; the live walk of them is PARKED by the user, so do not start it. Pick the next open agent bullet under A0 (exercises for the features the Tutorial still skips), else A5, then A8. Skip every line marked user (A6, A7, A11, A12, A14, A17 item 8, A19).

This session fixed Note it: about 60 emails had landed on today's Email note because `filedOn` was the run day; it is now the day of the newest message from someone else, in the configured zone (`emailDay_`, `lastFromOthers_` in `gas-app/QueueProcessor.gs`), and `refileEmailNotesByDay` (`gas-app/HubController.gs`, top-level delegator in `gas-app/Code.gs`) repairs the old rows. It then added mail and chat icons on Today > Appointments rows (`src/attendeeActions.js`, mirrored inline in `gas-app/Script.html`; shown only with other attendees; Chat has no link that sets a group title, so the chat icon copies "title: addresses" and opens Google Chat) and a textarea-style resize handle on `.note-card-lines` (both ways, sideways scrollbar only on overflow, not saved).

- What changed: TODO_HISTORY.md "2026-11-18 (later)"; TODO.md A19 (renamed, new hand-check line); LEARNINGS.md already had a 2026-11-18 entry.
- Still open: TODO.md A19 (all user: HOME hand-checks on @500 and @502, repoint WORK to the newest version, run `refileEmailNotesByDay` in the WORK IDE after the repoint, WORK invite subject if RSVP buttons are still missing) plus the older user items in A6, A7, A11, A12, A14, A17 item 8, and "For the session after next" (B1, B3, B4, B5), which needs the user.
- User items, with my recommendation:
  1. Repoint WORK `/exec` to the newest version (only `michael.hoffman@gsa.gov` can). T.
  2. After the repoint, run `refileEmailNotesByDay` once from the WORK IDE (Code.gs, Run); rerun until it logs 0 left. T. HOME's ledger is separate; ask before touching it.
  3. Hand-check on HOME @502: mail icon opens Gmail compose with To and Subject; chat icon toasts and opens Chat; drag a note card's lines corner. T.
- Traps: the mock server runs on `PORT=3411 npm start` from this worktree (port 3000 may serve another checkout). Alpine renders a tick late, so wait about 80 ms before reading the DOM after a synthetic key. `sed -i 'Nr file'` is refused in a worktree, and so are heredocs and compound commands; use Edit or Write (job temp files go in `$CLAUDE_JOB_DIR/tmp`). Never `cd` in a Bash call: it moves the session cwd. This worktree has no `node_modules` for `npm run test:mutation`; see the 2026-11-16 note in LEARNINGS.md. A resize cap that uses `max-height` blocks growth; the card uses `:not([style*="height"])` because Chrome writes an inline height on drag.
