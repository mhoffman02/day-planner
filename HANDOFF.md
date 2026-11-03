<!-- handoff: branch=worktree-today-rollover-smart-paste worktree=/home/mike/projects/day-planner/.claude/worktrees/today-rollover-smart-paste base=d78433445ef8 written=2026-11-03T11:36:00-08:00 -->
# Resume: per-line WYSIWYG notes editor and rich Doc view shipped; user hand-check pending

> **WARNING: written on branch `worktree-today-rollover-smart-paste`** (a linked worktree), pushed to `pure-gas-main`. The main checkout is stale until:
> `git -C /home/mike/projects/day-planner pull --ff-only`

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-03T11:36:00-08:00` **and** its parent isn't `d78433445ef8`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline d78433445ef8..origin/pure-gas-main`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** agent work: TODO.md A0 Tutorial coverage exercises (walk T09, T16 live on HOME; T10, T14, T18, T20 need flags or heavy mail, leave). User-gated, ask at the same time: (1) hand-check the WYSIWYG editor (link modal, multi-line paste, Backspace at the start of a list line, dictation insert), default: user reports breakage, agent fixes red-test-first; (2) optional `/mobilebasic` Doc pane, default: F (skip).

This session shipped the per-line contenteditable notes editor (`src/lineEditor.js`; Doc markup unchanged) and made the Google Doc view render markup as rich text (`docBlockMarkup` in `src/app.js`). HOME deployed @375 (live /dev + axe passed), WORK pushed; the user repoints WORK in the IDE.

- What changed: TODO.md B1 (notes portal item), PLAN.md Phase 32 checklist, LEARNINGS.md 2026-11-03.
- Still open: TODO.md sections "Agent work" and "For the session after next" (B1 scheduled-tick Decision check, day rollover live check, /mobilebasic choice, B3, B4); Tutorial coverage exercises (TODO A0).
- 2026-11-11: check `npm run rpc -- getHubStatus`, drop the day-6 warning in `tools/gas-rpc.js` (red test first).
- Trap: worktree Bash refuses compound commands; write script files and run plain commands. In `gas-app/*.html` never put `//` in strings.
