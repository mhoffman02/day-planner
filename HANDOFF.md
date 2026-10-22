<!-- handoff: branch=worktree-meet-link-hover worktree=/home/mike/projects/day-planner/.claude/worktrees/meet-link-hover base=22d409a2675e written=2026-10-22T07:54:57-07:00 -->
# Resume: Phase 31 search polish (`/` hotkey, status + due in results, dedupe); appointments + search shipped, WORK v165 verified

> **WARNING: written on branch `worktree-meet-link-hover`** (worktree
> `/home/mike/projects/day-planner/.claude/worktrees/meet-link-hover`), not `pure-gas-main`. The handoff commit is
> pushed to `origin/pure-gas-main`; the main checkout is behind until `git -C /home/mike/projects/day-planner pull --ff-only`.
> `pure-gas-main` is the working branch (CLAUDE.md rule 5). `master` has diverged on purpose; don't merge into it.

**Verify first:** `git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`.
Stale if that commit is dated after `2026-10-22T07:54:57-07:00` **and** its parent isn't `22d409a2675e`; then read
that commit's `HANDOFF.md` instead and tell the user. `git log --oneline 22d409a2675e..origin/pure-gas-main` shows
anything that landed after this prompt (only the handoff commit is expected).

**Start by:** grep every keydown handler in `src/app.js` and `gas-app/Script.html` for the universal-search hotkey and
any `/` binding, then build Phase 31 item 1 (`/` focuses the Master Tasks filter box) red test first, in both clients.

This session shipped, all verified by the user on WORK v165 and live on HOME @336: the appointment hover note's Meet
link is a clickable "Google Meet" link; RSVP read + write (Going? Yes / No / Maybe in the popup and hover note,
`setEventRsvp` RPC, no email sent); universal search task results deep link to the row (filter to the query, un-hide,
scroll/focus/highlight); Master Tasks got a debounced filter box; one All / Any / Phrase matcher shared by both
searches, shown as small radio toggles.

- What changed: `TODO_HISTORY.md`, 2026-10-22 entry.
- Still open, Phase 31 in `TODO.md` (in order, user-requested):
  1. `/` focuses the Master Tasks filter box when Master is active and focus is not in an input.
  2. Status glyph + due date (or "Undated") in universal search task result snippets.
  3. Dedupe task results by id when a task comes from both `dailyTasks` and `masterTasks` (dedupe only, never route
     by id membership).
- Key code: `matchesSearchQuery` / `executeUniversalSearch` in `src/searchEngine.js`, mirrored in `gas-app/Script.html`;
  tests in `tests/searchMatchMode.test.js` (both clients + both Index copies).
- Every gas-app push: `clasp push --force` + `clasp deploy -i <HOME id> -d "Day Planner v1"`, then `npm run push:work`
  once, then tell the user "Update WORK". Stop test servers by background task id, never `pkill`.
- User-gated Phase 30 items remain in `TODO.md` (Filter Suggestions paste, WORK Meeting Prep, UAT run).
