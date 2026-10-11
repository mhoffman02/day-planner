<!-- handoff: branch=worktree-drive-grant-picker worktree=/home/mike/projects/day-planner/.claude/worktrees/drive-grant-picker base=1cda8dbcb872 written=2026-10-10T20:11:54-07:00 -->
# Resume: Phase 29 code is done and on /dev; only the live 3-item check is left (needs Gmail connector auth)

> **WARNING: written on branch `worktree-drive-grant-picker`** (worktree
> `/home/mike/projects/day-planner/.claude/worktrees/drive-grant-picker`). Every commit was also pushed to
> `origin/pure-gas-main`. To update the main checkout: `git -C /home/mike/projects/day-planner pull --ff-only`

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
This prompt is stale if that commit is dated after `2026-10-10T20:11:54-07:00` **and** its parent (2nd field) isn't
`1cda8dbcb872`, or if `git worktree list` shows a worktree whose `HANDOFF.md` stamp has a later `written=`. If stale,
read `git show <1st field>:HANDOFF.md` and use that instead. Then run `git log --oneline 1cda8dbcb872..origin/pure-gas-main`.
Any commit there besides the handoff commit means work landed after this prompt.

**Start by:** if the `mcp__claude_ai_Gmail__*` tools beyond `authenticate` are available, do the live 3-item run
([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) line 18). If they aren't, ask the user to run `/mcp` and pick
"claude.ai Gmail". Don't ask the user to make the threads; Claude makes them.

## OBJECTIVE
Phase 29 cuts hub Sheet traffic per queue run, using only the Advanced Sheets service. Before: 4 reads and 6 writes for
3 items. Target: 1 read and about 4 writes. The code is done; the remaining step is a live confirmation with real items.

## KEY DECISIONS
- **Snapshot** ([`gas-app/Config.gs`](file:///home/mike/projects/day-planner/gas-app/Config.gs) `beginSnapshot`/`endSnapshot`):
  - Makes ONE `Values.batchGet` of Config `A2:B200`, Registry `A1:M500` and the ledger (`DPLedgerRepo.readRange()`).
  - While it is open, `getConfig`, `getRegistry` and `getFeatures({fresh})` read from it. `setFeature`,
    `setRegistryDocId` and `updateRegistryRows` patch it after their write, so later reads in the run are never stale.
  - It is opened only inside `runLocked_` and dropped in that function's `finally`.
- **Write combining** ([`gas-app/LedgerRepository.gs`](file:///home/mike/projects/day-planner/gas-app/LedgerRepository.gs)):
  - Inside a session, non-PENDING rows are queued. A PENDING claim sends the queue plus itself in one `batchUpdate`,
    so every claim is durable before its side effect.
  - `runLocked_` calls `DPLedgerRepo.flush()` before reading the meter. That call throws on failure.
  - `endSession` flushes anything left over. On failure it logs the stack and doesn't throw, so it never masks the
    run's own error. The rows then stay PENDING and retry once stale; the targets are idempotent by op key.
- **Discovery** uses `DPConfig.updateRegistryRows([{seriesKey, fields}])`: it validates every update first, then does
  one read and one batch write. `updateRegistryRow` was removed because nothing called it.
- Earlier decisions stand: Advanced Service only, hub Sheet only, typed RPCs only, `FORMATTED_VALUE` reads.

## CURRENT STATE
- **Commits**, all pushed and on HOME `/dev`; the gas-rpc API deployment was redeployed on each run:
  - `464ed69` snapshot
  - `7480c07` write combining
  - `eacaf7f` updateRegistryRows
  - `1cda8db` PENDING check reads `DPEngines.LEDGER_STATUS.PENDING`
- **Tests:** 854/854, lint clean. New: [`tests/hubSnapshot.test.js`](file:///home/mike/projects/day-planner/tests/hubSnapshot.test.js),
  [`tests/hubWriteCombine.test.js`](file:///home/mike/projects/day-planner/tests/hubWriteCombine.test.js).
  The fake 3-item run makes 1 `batchGet` and 4 writes.
- **Live on HOME:**
  - Empty `processWorkflowQueue`: `sheetsReads` 1 (was 3), 0 writes, DONE.
  - `hubSpike` ok and `runSelfTest` 100% PASS.
  - `discoverMeetingSeries` ok, but it matched 0 series, so the batch write has not run live.
- **Not live-verified yet:** the combined write path. The empty runs make 0 writes.
- **Ledger:** `counts.DONE` is 6 and `DRY_RUN` is FALSE on HOME, so the test run creates real Tasks.
- Phase 29 is not archived. Its live exit criterion is still open.

## CONSTRAINTS & PREFERENCES
- Start replies with `🔋Mike:`. Terse, no preamble or recap. Use `file://` links.
- No global variables in `.gs`. Shared state lives in frozen IIFE namespaces behind getters and setters.
- Every catch rethrows or calls `console.error` with the stack. TDD: red test first.
- Commit straight to the working branch and push to `origin/pure-gas-main`. No PRs. `clasp push` to `/dev` after a
  commit is pre-authorized; the prod `/exec` deploy needs the user's go.
- User, 2026-10-10: "YOU forward the 3 emails". Claude creates the test threads.
  - Use NEW emails with unique subjects. A self-forward lands in the old DONE thread and gets skipped.
  - The app is `gmail.readonly` and can't send. Do not widen its scope.

## OPEN THREADS (THE 3 MOST IMPORTANT TASKS)
1. **Live 3-item run** ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) line 18).
   - Blocked on `/mcp` Gmail auth. Must happen before the rpc login dies on **2026-10-17**.
   - Expect 1 read, 4 writes, and `counts.DONE` 6 → 9.
   - Then tick the live exit in [`PLAN.md`](file:///home/mike/projects/day-planner/PLAN.md) Phase 29 and archive the
     phase to `PLAN-HISTORY.md`.
2. **Phase 28 live `/dev` checks** via `tools/ensure-chrome.js` + `tools/e2e/*`
   ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md), Phase 28 section).
3. **7-day Testing expiry watch / publish the consent screen** (user decision); the rpc login dies 2026-10-17.

Blocked on the user:
- Pinned prod `/exec` deploy and WORK promotion, only on the user's go.
- WORK `/exec` repoint, which only the GSA account can do.

## IMMEDIATE NEXT STEP
Once Gmail is authenticated:
1. Send 3 emails to mhoffman02@gmail.com with subjects `DP L5 batch test <timestamp> A/B/C`.
2. Label them `🎯/Task`, `🎯/Task-Today` and `🎯/Waiting`.
3. Run `npm run rpc -- processWorkflowQueue --deploy`, then `npm run rpc -- getHubStatus`.
