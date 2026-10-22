<!-- handoff: branch=worktree-meet-link-hover worktree=/home/mike/projects/day-planner/.claude/worktrees/meet-link-hover base=a99d8240668a written=2026-10-22T09:12:39-07:00 -->
# Resume: Phase 31 search polish (`/` decision, status + due in results, dedupe); appointments + search shipped, WORK v165 verified

> **WARNING: written on branch `worktree-meet-link-hover`** (worktree
> `/home/mike/projects/day-planner/.claude/worktrees/meet-link-hover`), not `pure-gas-main`. The handoff commit is
> pushed to `origin/pure-gas-main`; the main checkout is behind until `git -C /home/mike/projects/day-planner pull --ff-only`.
> `pure-gas-main` is the working branch (CLAUDE.md rule 5). `master` has diverged on purpose; don't merge into it.

**Verify first:** `git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`.
Stale if that commit is dated after `2026-10-22T09:12:39-07:00` **and** its parent isn't `a99d8240668a`; then read
that commit's `HANDOFF.md` instead and tell the user. `git log --oneline a99d8240668a..origin/pure-gas-main` shows
anything that landed after this prompt (only this restamp commit is expected).

**Start by:** ask the user to decide Phase 31 item 1: `/` **already opens universal search** in both clients
(`setupKeyboardShortcuts`: [`src/app.js:924`](file:///home/mike/projects/day-planner/src/app.js#L924),
[`gas-app/Script.html:2713`](file:///home/mike/projects/day-planner/gas-app/Script.html#L2713)). Proposed default: on
Master Tasks only, `/` focuses the filter box; Ctrl+Shift+F (anywhere) and Ctrl+K (outside text inputs) still open
universal search. While
waiting, build item 2 red test first, in both clients.

This session shipped, all verified by the user on WORK v165 and live on HOME @336: the appointment hover note's Meet
link is a clickable "Google Meet" link; RSVP read + write (Going? Yes / No / Maybe in the popup and hover note,
`setEventRsvp` RPC, no email sent); universal search task results deep link to the row (filter to the query, un-hide,
scroll/focus/highlight); Master Tasks got a debounced filter box; one All / Any / Phrase matcher shared by both
searches, shown as small radio toggles.

- What changed: `TODO_HISTORY.md`, 2026-10-22 entry.
- Still open, Phase 31 in `TODO.md` (in order, user-requested):
  1. `/` focuses the Master Tasks filter box: **user decision first** (see Start by).
  2. Status glyph + due date (or "Undated") in universal search task result snippets (task block of
     `executeUniversalSearch`, [`src/searchEngine.js:142`](file:///home/mike/projects/day-planner/src/searchEngine.js#L142)).
  3. Dedupe task results by id when a task comes from both `dailyTasks` and `masterTasks`. Keep the first copy (Daily
     is searched first); `targetView` still comes from the task's own fields (`!dueDate || master`), never from which
     list it came from or id membership.
- Then agent work in Phase 30 (`TODO.md`):
  - **Overdue since 2026-10-17:** the 7-day rpc token. Probe with `npm run rpc -- runSelfTest` (no `--deploy`: that pushes and repoints); if it is dead,
    the user reruns the rpc login.
  - HOME `/dev` live checks: Forward/Delegate (Daily + Master, Undo), and trial-mode controls.
- User-gated Phase 30 items: Filter Suggestions paste, WORK Meeting Prep, WORK trial mode off, UAT run, test data cleanup.
- Key code: `matchesSearchQuery` / `executeUniversalSearch` in `src/searchEngine.js`, mirrored in `gas-app/Script.html`;
  tests in `tests/searchMatchMode.test.js` (both clients + both Index copies).
- Every gas-app push: `clasp push --force` + `clasp deploy -i <HOME id> -d "Day Planner v1"`, then `npm run push:work`
  once, then tell the user "Update WORK". Stop test servers by background task id, never `pkill`.
