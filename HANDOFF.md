<!-- handoff: branch=feat/gmail-meeting-hub worktree=/home/mike/projects/day-planner/.claude/worktrees/today-hover-zoom base=59e4119c5ade written=2026-10-10T13:37:34-07:00 -->
# Resume: agent can now run HOME server-side tests headlessly; next is Phase 28 live verification

> **WARNING: written on branch `feat/gmail-meeting-hub`** (worktree `/home/mike/projects/day-planner/.claude/worktrees/today-hover-zoom`),
> not `pure-gas-main`. Until merged, `pure-gas-main`'s copy of this file is stale. Merge:
> `git -C /home/mike/projects/day-planner merge --ff-only feat/gmail-meeting-hub` (with `pure-gas-main` checked out there).

**Verify first:**
`git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-10-10T13:37:34-07:00` **and** its parent isn't `59e4119c5ade`. Then
`git log --oneline 59e4119c5ade..feat/gmail-meeting-hub`: anything besides the handoff commit landed after this prompt.

**Start by:** `npm run rpc -- hubSpike` and read the JSON (expect `RESULT: PASS`). On failure, fix red-test-first, then
`npm run rpc -- <fn> --deploy` to rerun against the new code.

## OBJECTIVE
Phase 28 makes Day Planner a workflow hub: Gmail triage to Google Tasks, recurring-meeting prep, app-owned meeting-notes
Docs. It is live on HOME `/dev`. This session added test tier D so the agent runs server-side GAS tests itself
("I want YOU to be able to run tests and read results directly, hands-free for me").

## KEY DECISIONS
- Tier D = Apps Script Execution API, not a signed `doGet`: [`tools/gas-rpc.js`](file:///home/mike/projects/day-planner/tools/gas-rpc.js),
  skill [`.agents/skills/gas-rpc/SKILL.md`](file:///home/mike/projects/day-planner/.agents/skills/gas-rpc/SKILL.md). HOME only (GSA can't link a GCP project).
- `scripts.run` answers ONLY on the API-executable deployment ID (`AKfycbwT8sjq…`) with `devMode:false`; script ID and
  `devMode:true` both 404 (verified live). `--deploy` = `clasp push` + `clasp update-deployment` of that ID; never touches pinned `/exec`.
- HOME script linked to GCP "Day Planner" (`day-planner-507615`, #951958469609). Desktop OAuth client `…1oe2h6on…` (the
  `…i2q6…` Web client is the old GIS one, unusable by clasp).
- Consent screen stays in **Testing** by user choice ("not ready to share"); rpc refresh token dies every 7 days. The tool warns from
  day 6. User will publish "once it's working"; then re-login.
- clasp creds: `~/.clasprc.json` `default` + `rpc` = mhoffman02@gmail.com; `~/.clasprc.work.json` = GSA (push:work only). The
  old GSA `default` made HOME deploys fail ("Only users in the same domain...").
- Earlier Phase 28 decisions (gmail.readonly only, fail-loud/fail-closed, series never guessed) stand; see `PLAN.md` Phase 28.

## CURRENT STATE
- Branch `feat/gmail-meeting-hub` at `59e4119` (+ this handoff commit), pushed to origin; NOT merged to `pure-gas-main`.
- Lint clean, 811/811 tests. HOME `/dev` and API deployment @301 run the `59e4119` code; pinned prod `/exec` still @297.
- Live: `npm run rpc -- runSelfTest --deploy` = HEALTHY 7/7 (exit 0).

## CONSTRAINTS & PREFERENCES
- Terse, start with `🔋Mike:`; commit directly, no PR theater. "Force fails. TDD. Fail loud. NEVER fail silent!"
- Run GAS functions yourself via `npm run rpc`; only ask the user to click Run when gas-rpc can't (auth expired → give them the login URL).
- Name IDE functions as `File.gs:fn`. Browser checks only via `tools/ensure-chrome.js` + `tools/e2e/*` (the CDP profile is NOT signed in to Google).
- Subagents: tier agents `lite`/`worker`/`deep`, cheapest capable, exit criteria + TDD. Worktree sessions refuse compound git commands.

## OPEN THREADS (THE 3 MOST IMPORTANT TASKS)
1. `hubSpike` via gas-rpc, then the live `/dev` UX checks ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) lines 19, 24-27).
2. User: merge to `pure-gas-main`, decide pinned prod `/exec` deploy (carries `gmail.readonly`) ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) lines 18, 28).
3. Watch for the 7-day Testing expiry hitting the web app or triggers; publish + re-login when the user says so ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) lines 20-23).

## IMMEDIATE NEXT STEP
`npm run rpc -- hubSpike`
