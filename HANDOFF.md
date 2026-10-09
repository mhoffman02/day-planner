# Resume: Merge the hover/zoom fix, verify live on HOME, user repoints WORK

**Start by:** from the main checkout run `git merge worktree-today-hover-zoom`, then live-verify on HOME `/dev`.

## OBJECTIVE
Fix Today-page task-notes hover popovers (clipped, start open, last note opens when hovering first) and add a text-zoom slider to the Tasks pane header. Code is done; pushed to HOME /dev and WORK v130; merge + live verification + WORK repoint remain.

## KEY DECISIONS
- Root cause: popover `:style` was a string → Alpine sets `cssText`, wiping `x-show`'s `display:none` on every popover whenever `notesPopoverPos` changed. Fixed with object-returning `notesPopoverStyle()` (same as `statusMenuStyle`).
- Hover is mouse-only (`pointerType === 'mouse'`); tap opens; outside tap/Esc closes. Matches status menu.
- Clipped top row = cursor glyph over first line → 22px top padding, no gap.
- Zoom slider centered in Tasks header (user's suggestion; navbar crowded), 80-140%, `localStorage` key `dayPlannerTaskZoom`, double-click resets. "Ask UX PRO" was not spawned; decided inline.
- `gas-app/{Index,Script,Styles}.html` are the production files (hand-maintained, ES5 style in Script.html); `src/` is a mirror.

## CURRENT STATE
- Branch `worktree-today-hover-zoom` @ `f641dc3` (based on `pure-gas-main` `4a7d75b`), worktree `.claude/worktrees/today-hover-zoom`. Not merged into `pure-gas-main`.
- Lint + 203 tests pass. Not browser-verified.
- HOME `/dev` (@HEAD) pushed. HOME pinned-prod `clasp deploy -i` FAILED ("Only users in the same domain as the script owner may deploy this script") - rerun it after merge. WORK pushed as Version 130.

## CONSTRAINTS & PREFERENCES
- Be terse; start replies `🔋Mike:`; commit directly, no PR theater.
- After `push:work` just say "Update WORK" (no repoint steps).
- Never use generic browser automation; use `tools/ensure-chrome.js` + `tools/e2e/*`.
- No pills; GAS HTML files: no `//`, apostrophes, backticks in strings/comments.

## OPEN THREADS (THE 3 MOST IMPORTANT TASKS)
1. Merge `worktree-today-hover-zoom` into `pure-gas-main` (see [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md)).
2. Live-verify popovers + zoom on HOME ([`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html), [`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) `notesPopoverStyle`, `setTaskZoom`).
3. User repoints WORK `/exec` (only `michael.hoffman@gsa.gov`).

## IMMEDIATE NEXT STEP
`git merge worktree-today-hover-zoom` in `/home/mike/projects/day-planner` (note its uncommitted `.claude/commands/handoff.md` edit).
