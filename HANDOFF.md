<!-- handoff: branch=a18-a0 worktree=/home/mike/projects/day-planner/.claude/worktrees/a18-a0-tutorial base=92792ff301a8 written=2026-11-18T08:02:19-08:00 -->
# Resume: Gmail-style hotkeys, Triage RSVP and Note it shipped (HOME @500, WORK v295 pushed); next agent work is TODO.md A0 (Tutorial T21+)

> Written on worktree branch `a18-a0` and pushed as `HEAD:pure-gas-main` (one landing path). The main checkout is stale until: `git -C /home/mike/projects/day-planner pull --ff-only`

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-18T08:02:19-08:00` **and** its parent isn't `92792ff301a8`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline 92792ff301a8..origin/pure-gas-main`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** TODO.md A0 (agent, in progress, PLAN Phase 36). T21-T31 are written; the live walk of them is PARKED by the user, so do not start it. Pick the next open agent bullet under A0 (exercises for the features the Tutorial still skips), else A5, then A8. Skip every line marked user (A6, A7, A11, A12, A14, A17 item 8, A19).

This session fixed the missing RSVP buttons on Triage invite rows (stale row cache, `triageRow.v3:` in `gas-app/HubController.gs`), added the row-field guard test, and built the Gmail-style hotkeys requested on 2026-11-18. `src/hotkeys.js` is one table that drives both the key dispatch (`setupKeyboardShortcuts`, `runHotkey`, `runTriageHotkey` in `src/app.js`) and the `?` help dialog. Triage: j/k, e, #, Shift+T, m, o/Enter. `#` also deletes the cursor task on Today and Master Tasks (appointments excluded). Notes: Ctrl+Shift+8 and 7 make bullet and numbered lists.

- What changed: TODO_HISTORY.md "2026-11-18"; TODO.md A19 (new); LEARNINGS.md 2026-11-18.
- Still open: TODO.md A19 (all user: indent decision default F, HOME hand-check on @500, repoint WORK to v295, WORK invite subject if buttons are still missing) plus the older user items in A6, A7, A11, A12, A14, A17 item 8, and "For the session after next" (B1, B3, B4, B5), which needs the user.
- User items, with my recommendation:
  1. Ctrl+[ and Ctrl+] indent in Notes: F (skip). Lines are flat markdown prefixes and the Doc writer only bullets lines starting `- `, so indent needs a nested-list model.
  2. Hand-check the hotkeys on HOME @500 (j, e, m, Shift+T on a live Triage row; `?`; `#` on Today and Master). T.
  3. Repoint WORK `/exec` to v295 (only `michael.hoffman@gsa.gov` can). T.
- Traps: the mock server runs on `PORT=3411 npm start` from this worktree (port 3000 may serve another checkout). Alpine renders a tick late, so wait about 80 ms before reading the DOM after a synthetic key. `sed -i 'Nr file'` is refused in a worktree; use Edit. This worktree has no `node_modules` for `npm run test:mutation`; see the 2026-11-16 note in LEARNINGS.md.
