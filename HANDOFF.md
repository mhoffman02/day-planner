<!-- handoff: branch=pure-gas-main worktree=/home/mike/projects/day-planner base=83c67c53a7ec written=2026-11-12T13:39:24-08:00 -->
# Resume: resizable table columns shipped (HOME @442, WORK pushed); verified on HOME and WORK 2026-11-12

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-12T13:39:24-08:00` **and** its parent isn't `83c67c53a7ec`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline 83c67c53a7ec..origin/pure-gas-main`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** agent work: (1) PLAN.md Phase 30 OVERDUE rpc-token check (`npm run rpc -- getHubStatus`: a live HOME Execution API call, read-only; PLAN.md heads Phase 30 "Blocked on user" but names this as the first agent action); (2) TODO.md A10 first bullet: diagnose why `npm run smoke` fails on clean HEAD (thrown in `tools/smoke-test.js` ~L150; local preview is http://localhost:3000, so use `tools/ensure-chrome.js http://localhost:3000` + `tools/probe-live.js`, red test or repro first), which also verifies the local-preview `index.html` port. User-gated items below are listed separately.

This session added drag-resizable table columns (`initTableColumns` in `src/app.js`, helpers in `src/layoutPrefs.js`, `data-col-table` tables, Widths Reset in View options; Triage not exercised live, queues were empty; user declined a check and will report if it feels off) and removed the binder 1720px cap (8px gutter, 52px/4px vertical padding in `src/styles.css` and `gas-app/Styles.html`) and added drag-to-resize reading width for About/Tutorial (`src/layoutPrefs.js`, `initReadingResize` in `src/app.js`, mirrored in `gas-app/Script.html`; saved as `dayPlannerReadingWidth`). Lint clean, 2236 tests pass at 83c67c5 (HEAD before this handoff commit); all session commits are on origin.

User items (WORK repoint, layout, reading-width and table-column checks done 2026-11-12), with my recommendation:
1. Older hand-checks still open: A9 slot click, A6 (unreproduced Task Today/Later lock), A7/A8 WORK checks. Recommend: (a) hand-check A9 and A7/A8 on WORK when next at the WORK PC; (b) A6 stays parked until it reproduces. Answer T/F per item.

- What changed: TODO_HISTORY.md (layout and table-column items archived), LEARNINGS 2026-11-12 (layout, table columns).
- Still open: TODO.md "Agent work" (A0, A5, A8 open for agents; A6, A7, A9 and A10 hand-check lines need the user; A10 smoke and ensure-chrome bullets are agent work) and "For the session after next" (B1/B3/B4, user present).
- Traps: edits to `src/app.js` need the same edit in `gas-app/Script.html` (and `src/styles.css` in `gas-app/Styles.html`); in `gas-app/*.html` never put `//` in strings or apostrophes in comments; `soc/inline-style-binding` baseline is 10 for gas-app/Index.html (11 for index.html), so no new `:style` there. Never run `pkill -f "node server.js"` (killed the shell). Run `git status .claude .kilo` before `npm run sync:agents`. A live CDP check must reload the Day Planner tab first, via `eval-console.js "location.href=<dev url>"` on the top frame (reloading the inner iframe breaks the app).
