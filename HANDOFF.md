<!-- handoff: branch=pure-gas-main worktree=/home/mike/projects/day-planner/.claude/worktrees/retro-sec base=577b81decc55 written=2026-11-13T09:41:55-08:00 -->
# Resume: security review fixed and live (HOME @446, WORK v245); small follow-ups queued in TODO.md A12

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-13T09:41:55-08:00` **and** its parent isn't `577b81decc55`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline 577b81decc55..origin/pure-gas-main`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** agent work: (1) TODO.md A12 first bullet: drop the unreachable CalendarApp-style branches (`getHangoutLink`, `getTitle`, `getDescription`, `getLocation` function checks) in `extractMeetLinkFromEvent_` (`gas-app/Code.gs` ~L1176); its only caller `mapCalendarApiEvent_` passes raw Calendar API events; no test covers it, so first add hangoutLink, conferenceData and description-only cases to `tests/editCalendarEvent.test.js`, then `npm run deploy:home`; (2) TODO.md A10 first bullet: diagnose why `npm run smoke` fails on clean HEAD (the throw is `tools/smoke-test.js` L150; run `npm start` first). User-gated items below are listed separately.

This session ran a full-project security review and shipped the fixes: allowlist sanitizer and single-pass links, a gated and 24 h-capped OAuth-token page (`REGRANT_ENABLED_UNTIL`), SRI, localhost-only `server.js`, gated `gas-rpc --deploy`, read-only gemini-delegate, and `calendar` narrowed to `calendar.events` (CalendarApp ported to the Calendar advanced service). Re-consent done on HOME and WORK. Master Tasks now scrolls sideways below 900 px (Action column 300 px). Lint clean, 2461 tests pass at `4dd230d`; retro committed `577b81d`.

User items, with my recommendation:
1. TODO.md A12: hand-check task-to-calendar title sync on an OLD event (created before 2026-11-13); old events may carry `gasTaskId` only in private extended properties. Recommend T; tell me which event failed.
2. TODO.md A12: `drive.readonly` stays for Doc action items. Recommend keep (T).
3. TODO.md A12: delete `PICKER_API_KEY` on HOME once the Drive re-grant TODO is closed; old scratch voice-typing Docs cannot be pulled, start a new one.
4. In the main checkout: `git merge --ff-only origin/pure-gas-main`, then `node tools/prune-branches.js --apply` (removes the `retro-sec` worktree).
5. Older items unchanged: TODO.md A11 (connectors, `/usage` due 2026-11-19), A9 slot click, A6, A7/A8 WORK checks.

- What changed: TODO.md A12 (new), TODO_HISTORY.md 2026-11-13, PLAN.md Phase 34, LEARNINGS 2026-11-13.
- Still open: TODO.md "Agent work" (A12 first two bullets, A10, A0, A5, A8 for agents; A6, A7, A9, A11 and the A12 user lines need the user) and "For the session after next" (B1/B3/B4, user present).
- Traps: a fix guessed without measuring failed (Master Tasks `min-width` 760 px never scrolled; measure live geometry via `eval-console.js --iframe` first). The worktree base is `master`; run `git reset --hard origin/pure-gas-main` in a fresh empty worktree. Push with `git push origin HEAD:pure-gas-main` (the branch is checked out in the main checkout). The IDE shows no consent prompt for new scopes: pull the URL from the live app (`getHubStatus` returns `authUrl`). `PICKER_API_KEY` and `REGRANT_ENABLED_UNTIL` matter on HOME only. Edits to `src/styles.css` need the same edit in `gas-app/Styles.html`; `tests/tableColumns.test.js` pins column default widths.
