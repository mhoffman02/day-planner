<!-- handoff: branch=feat/gmail-meeting-hub worktree=/home/mike/projects/day-planner/.claude/worktrees/today-hover-zoom base=781c52154cb1 written=2026-10-10T10:35:13-07:00 -->
# Resume: Phase 28 hub is live on HOME /dev and hardened; next is live verification

> **WARNING: written on branch `feat/gmail-meeting-hub`** (worktree `/home/mike/projects/day-planner/.claude/worktrees/today-hover-zoom`),
> not `pure-gas-main`. Until merged, `pure-gas-main`'s copy of this file is stale. Merge:
> `git -C /home/mike/projects/day-planner merge --ff-only feat/gmail-meeting-hub` (with `pure-gas-main` checked out there).

**Verify first:**
`git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-10-10T10:35:13-07:00` **and** its parent isn't `781c52154cb1`. Then
`git log --oneline 781c52154cb1..feat/gmail-meeting-hub`: anything besides the handoff commit landed after this prompt.

**Start by:** ask the user for the results of (1) `UnitTests.gs:hubSpike` (expect `RESULT: PASS`) and (2) the live `/dev` checks in
[`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) "Phase 28" section, and whether to redeploy pinned prod `/exec`
(held: carries `gmail.readonly`). If they want help with the `/dev` checks, drive them with `node tools/ensure-chrome.js` + `tools/e2e/*`.

## OBJECTIVE
Phase 28 makes Day Planner a workflow hub: Gmail triage to Google Tasks, recurring-meeting prep from Calendar, app-owned
meeting-notes Docs. Code is pushed to HOME `/dev`; this session also hardened the whole app to fail loud and fail closed.

## KEY DECISIONS
- Gmail read-only (`gmail.readonly`, Advanced Gmail; `GmailApp` lint-banned); labels `🎯/...` applied by hand.
- No `userinfo.email` scope: user email comes from `Gmail.Users.getProfile('me')`, stored in Config `UserEmail`.
- Folder access via `Drive.Files.get(...userPermission)`; fail closed (`driveFolderAccess_` in [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs)).
- Every catch rethrows or `console.error`s its stack; enforced by [`tools/check-catch-logging.js`](file:///home/mike/projects/day-planner/tools/check-catch-logging.js) in lint + pre-commit.
- Client errors go to a keyed error tray; saves go through a per-item queue (`createSaveQueue` in [`src/saveGuard.js`](file:///home/mike/projects/day-planner/src/saveGuard.js)) with rollback; note timers per date; deletes cancel queued saves.
- Meeting retries never guess a series (`MISSING_SERIES`/`SERIES_CONFLICT`/`CORRUPT_METADATA`).
- Day windows use the primary calendar time zone. Meet: retry without conference only on an explicit conference rejection; poll pending up to 3x; problems reported only via `meetError`.
- Subagents: tier agents `lite`/`worker`/`deep` (`~/.claude/agents/`), cheapest capable model AND effort, no advisor, TDD + exit criteria ([`.agents/rules/subagent-model-cost.md`](file:///home/mike/projects/day-planner/.agents/rules/subagent-model-cost.md)).

## CURRENT STATE
- Branch `feat/gmail-meeting-hub` at `781c521` (+ this handoff commit), NOT yet merged to `pure-gas-main` (last ff was before `b13d15b`).
- Lint clean, 784/784 tests pass. HOME `/dev` = `781c521` (pushed 2026-10-10 10:02). Pinned prod `/exec` not redeployed since the scope change.
- Sheets-under-`drive.file` spike PASSED on HOME; `hubSpike` failed at Config only because `UserEmail` was blank (user filled it); rerun pending.

## CONSTRAINTS & PREFERENCES
- Terse, start with `🔋Mike:`; commit directly, no PR theater. "Force fails. TDD. Fail loud. NEVER fail silent!"; fix pre-existing fail-open bugs, do not just report them.
- Name IDE functions only as `File.gs:fn` (e.g. "run `UnitTests.gs:hubSpike`"), no how-to steps.
- Browser checks only via `tools/ensure-chrome.js` + `tools/e2e/*`. No pills. GAS HTML: no `//` in strings, no apostrophes/backticks in comments.
- Worktree-isolated sessions refuse compound git commands: run plain single git commands.

## OPEN THREADS (THE 3 MOST IMPORTANT TASKS)
1. Live HOME verification: `hubSpike` rerun + `/dev` UX checks ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) lines 14-27).
2. Merge `feat/gmail-meeting-hub` into `pure-gas-main`; decide pinned prod `/exec` deploy.
3. `🎯/` labels + 2-3 test threads, DRY_RUN smoke, steps L1-L8 ([`docs/hub-setup-and-gate.md`](file:///home/mike/projects/day-planner/docs/hub-setup-and-gate.md)); then WORK via `npm run push:work`.

## IMMEDIATE NEXT STEP
Ask: "hubSpike result? `/dev` checks done? Deploy pinned prod `/exec` (carries `gmail.readonly`)?" Act on the answers; fix any failure red-test-first.
