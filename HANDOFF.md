<!-- handoff: branch=worktree-drive-grant-picker worktree=/home/mike/projects/day-planner/.claude/worktrees/drive-grant-picker base=90374e590554 written=2026-10-10T22:52:23-07:00 -->
# Resume: Phases 25 + 28 done and archived; only user-gated Phase 30 remains

> **WARNING: written on branch `worktree-drive-grant-picker`**; commits are also pushed to `origin/pure-gas-main`.
> To update the main checkout: `git -C /home/mike/projects/day-planner pull --ff-only`

**Verify first:** `git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if dated after `2026-10-10T22:52:23-07:00` and its parent isn't `90374e590554`. Then
`git log --oneline 90374e590554..origin/pure-gas-main`.

## OBJECTIVE
Ship the Gmail / Meeting Hub (Phase 28) from HOME to prod and WORK. HOME verification is finished. What remains is the
release: the pinned prod `/exec` redeploy, WORK promotion, and the consent-screen decision. All of it is gated on the user.

## KEY DECISIONS
- "Push WORK tasks out" means **defer**, not run `push:work`. WORK and prod items live in Phase 30 and wait for the user's go.
- Hub trigger **removed** after the L8 check. Don't reinstall it unasked; `installHubTriggers` makes the 5-minute queue
  act on real Gmail.
- Test cleanup that needs a new RPC is left to the user: there is no event-delete RPC, so the test appointment stays.
  RPC surface is security-relevant; typed endpoints only (`hubSetTasksListId` added for L6).
- Live-check substitutions, written into the docs:
  - hover/touch tested with synthetic PointerEvents;
  - `meetError` tested with a stubbed reply; a real Google rejection can't be induced on HOME;
  - full Meeting Prep render needs WORK's NCMMS series.
- The error-tray freeze bug is **not** in prod @297 or WORK v130: prod v297 has no error tray at all, checked via
  `clasp pull --versionNumber 297`.

## CURRENT STATE
- Branch `worktree-drive-grant-picker`, HEAD `90374e5`, pushed to `origin/pure-gas-main`.
- HOME `/dev` = HEAD (clasp push after `1cf2bcb`). The gas-rpc API deployment is @318. Pinned prod `/exec` is still @297.
- Phase 25 and Phase 28 are archived in [`PLAN-HISTORY.md`](file:///home/mike/projects/day-planner/PLAN-HISTORY.md);
  details are in [`TODO_HISTORY.md`](file:///home/mike/projects/day-planner/TODO_HISTORY.md) 2026-10-10.
- Bugs found live and fixed this session, each with a red test first:
  - `d09efea`: failed 🎯/Task ops now reach Triage System Exceptions (`getTriageBoard` + `queueFor`); `itemErrors`
    added; Advanced Gmail `body.data` is bytes (`bodyBytes_`); manifest start_url slice fixed.
  - `1cf2bcb`: error tray `x-show="entry.retry"` ran the retry on every render (Alpine invokes function-valued
    bindings) and froze the app on any failed save.
- Hub state:
  - flags: GMAIL_ROUTER and TRIAGE_BOARD on, DRY_RUN off, NCMMS_CORE_PILOT off;
  - TasksListId `@default`; 0 triggers; ledger DONE 10.
- CDP Chrome (port 9222) profile was signed in by the user 2026-10-10. Restart it with the
  `Browser.close` CDP call + `node tools/ensure-chrome.js <url>`, never taskkill (that kills the user's own Chrome).
- Tests 863/863, lint clean.

## CONSTRAINTS & PREFERENCES
- Start every reply with `🔋Mike:`. "MUST DO: Be terse." Clickable `file://` links.
- Commit straight to the working branch and push `origin/pure-gas-main`; no PRs ("No PR Theater").
- `clasp push` to `/dev` is pre-authorized. The pinned prod `/exec` deploy and WORK promotion need the user's go.
  After `push:work`, just say "Update WORK".
- Never widen scopes: app stays `gmail.readonly`, Drive `drive.file`.
- `.gs` code: no globals (IIFE namespaces with getters). Every `google.script.run` / gas-rpc function needs a
  top-level delegator in `Code.gs`. Fail-loud catches. TDD (red test first).
- Browser checks only via `tools/ensure-chrome.js` + `tools/eval-console.js` / `probe-live.js`; never generic browser
  automation.
- Hub test items: Claude sends NEW unique-subject emails to self via the Gmail connector and labels them.
- Alpine: never bind a function-valued property bare (`x-show="fn"`); use `typeof x === 'function'`.
- Remind the user the rpc login dies **2026-10-17** (Testing consent screen).

## OPEN THREADS (THE 3 MOST IMPORTANT TASKS)
1. [`TODO.md:15`](file:///home/mike/projects/day-planner/TODO.md#L15): pinned prod `/exec` redeploy (user go). Prod @297
   predates the hub, the scope change and this session's fixes.
2. [`TODO.md:16`](file:///home/mike/projects/day-planner/TODO.md#L16): WORK promotion, `npm run push:work`, then the
   GSA-account IDE repoint. Admin may need to approve `gmail.readonly`.
   Then [`TODO.md:19`](file:///home/mike/projects/day-planner/TODO.md#L19): the WORK Meeting Prep render.
3. [`TODO.md:11`](file:///home/mike/projects/day-planner/TODO.md#L11) and
   [`TODO.md:13`](file:///home/mike/projects/day-planner/TODO.md#L13): the 7-day expiry watch and the consent-screen
   decision, before 2026-10-17.

Also for the user: [`TODO.md:7`](file:///home/mike/projects/day-planner/TODO.md#L7) and
[`TODO.md:9`](file:///home/mike/projects/day-planner/TODO.md#L9) list the test data to delete.

## IMMEDIATE NEXT STEP
Every open item needs the user. Ask them to decide:
- (a) Go for the prod `/exec` redeploy now? Default: yes. HOME passed every check.
- (b) Run `npm run push:work` for WORK? Default: yes, after (a).
- (c) Publish the consent screen or stay in Testing?

Then run the approved step: (a) is `clasp deploy -i AKfycbzZW7LNOkWUhz_SQd4Ka2LCKvT9zwajFGGAHmDXtpG_W0YR28mPFEKwbtDLWyX13xn7YA`
from [`gas-app/`](file:///home/mike/projects/day-planner/gas-app/).
