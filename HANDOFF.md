<!-- handoff: branch=worktree-today-rollover-smart-paste worktree=/home/mike/projects/day-planner/.claude/worktrees/today-rollover-smart-paste base=ce163afde259 written=2026-11-03T12:15:00-08:00 -->
# Resume: per-line WYSIWYG notes editor and rich Doc view shipped; user hand-check pending

> **WARNING: written on branch `worktree-today-rollover-smart-paste`** (a linked worktree), pushed to `pure-gas-main`. The main checkout is stale until:
> `git -C /home/mike/projects/day-planner pull --ff-only`

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-03T12:15:00-08:00` **and** its parent isn't `ce163afde259`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline ce163afde259..origin/pure-gas-main`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** agent work: TODO.md A0 Tutorial coverage exercises (walk T09, T16 live on HOME; T10, T14, T18, T20 need flags or heavy mail, leave). User-gated, ask at the same time: (1) hand-check the WYSIWYG editor (link modal, multi-line paste, Backspace at the start of a list line, dictation insert), default: user reports breakage, agent fixes red-test-first; (2) optional `/mobilebasic` Doc pane, default: F (skip).

This session shipped the per-line contenteditable notes editor (`src/lineEditor.js`; Doc markup unchanged) and made the Google Doc view render markup as rich text (`docBlockMarkup` in `src/app.js`). It then added part-line colour: a colour button with text selected recolours just that selection (`lineEditorColorRange` in `src/lineEditor.js`, `applyLineFormat` in `src/app.js`). HOME @376 (live /dev + axe passed), WORK version 203; the user verified colours on WORK 2026-11-03.

- What changed: TODO.md B1 (notes portal item), PLAN.md Phase 32 checklist, LEARNINGS.md 2026-11-03.
- Still open: TODO.md sections "Agent work" and "For the session after next" (B1 scheduled-tick Decision check, day rollover live check, /mobilebasic choice, B3, B4); Tutorial coverage exercises (TODO A0).
- rpc token check, due 2026-11-11: run `npm run rpc -- getHubStatus`; if it still works, drop the day-6 warning in `tools/gas-rpc.js` (red test first). The consent screen is already In production, so the 7-day expiry may no longer apply (TODO.md B4).
- Trap: worktree Bash refuses compound commands; write script files and run plain commands. In `gas-app/*.html` never put `//` in strings.
