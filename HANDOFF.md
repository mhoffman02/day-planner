<!-- handoff: branch=worktree-drive-grant-picker worktree=/home/mike/projects/day-planner/.claude/worktrees/drive-grant-picker base=4199eebc3bea written=2026-10-10T19:25:39-07:00 -->
# Resume: Phase 29 step 0 meter shipped; L5 baseline waits on fresh labelled threads; next is the `sheetRanges.js` helper module

> **WARNING: written on branch `worktree-drive-grant-picker`** (worktree
> `/home/mike/projects/day-planner/.claude/worktrees/drive-grant-picker`). Every commit was also pushed to
> `origin/pure-gas-main`. The main checkout's local `pure-gas-main` is behind (`cb35933`). Update it:
> `git -C /home/mike/projects/day-planner pull --ff-only`

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
This prompt is stale if that commit is dated after `2026-10-10T19:25:39-07:00` **and** its parent (2nd field) isn't
`4199eebc3bea`, or if `git worktree list` shows a worktree whose `HANDOFF.md` stamp has a later `written=`. If stale,
read `git show <1st field>:HANDOFF.md` (or that worktree's file), use it instead, and tell the user. Then run
`git log --oneline 4199eebc3bea..origin/pure-gas-main`: any commit besides the handoff commit means work landed after
this prompt, so check it before redoing anything.

**Start by:** ask the user whether they have labelled fresh `🎯/` threads for the L5 baseline. If they have, run
`npm run rpc -- processWorkflowQueue --deploy` and record `counts.sheetsReads`/`sheetsWrites` per item in
[`PLAN.md`](file:///home/mike/projects/day-planner/PLAN.md) Phase 29. If they haven't, start the independent item:
TDD `src/integration/sheetRanges.js` ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) line 19).

## OBJECTIVE
Phase 29: cut hub Sheet traffic per queue run to about one batched read plus about one write per item, down from
4 reads per run plus 2 writes per item, using only the Advanced Sheets service. Step 0 measures before batching:
a per-run Sheets meter (done), then an L5 baseline with real items.

## KEY DECISIONS
- User decisions 2026-10-10 (in `PLAN.md` Phase 29): Advanced Service only (no SpreadsheetApp, no libraries), hub
  Sheet only, claims stay write-through, typed RPCs only.
- Meter design: `DPConfig.sheets()` is a metered stand-in for `Sheets.Spreadsheets`. Reads are `get` and
  `Values.get/batchGet`; writes are `batchUpdate` and `Values.update/batchUpdate/append`. It counts attempts, so a
  call that throws still counts. `runQueue` resets the meter before `getFeatures` (fresh Config reads count), and
  `runLocked_` copies it into `counts`. `endSession` writes nothing, so nothing is missed.
- Test on `/dev` only. The pinned prod `/exec` deploy waits for a release and the user's go (memory file body fixed
  this session to match).

## CURRENT STATE
- `4199eeb` feat(queue): `counts.sheetsReads/sheetsWrites`. Files: `gas-app/Config.gs` (`sheets_`,
  `resetSheetsMeter`, `sheetsMeter`, exported on `DPConfig`), `gas-app/LedgerRepository.gs` (calls
  `global.DPConfig.sheets()`), `gas-app/QueueProcessor.gs`, `tests/helpers/gasFakesHub.js` (fake returns zeros), new
  `tests/hubSheetsMeter.test.js`. 829/829 tests, lint clean.
- Pushed to `origin/pure-gas-main` and to HOME `/dev` (`clasp push --force`). The gas-rpc API deployment is @307.
- Live HOME run: `ok:true`, 0 candidates, **3 reads, 0 writes** (the empty-run floor). `dryRun:false`: **`DRY_RUN`
  is already FALSE on HOME.** The 3 test threads are already DONE in the ledger, so there were no items.
- `tools/check-gas-global-init-order.js` is referenced by `.agents/rules/gas-global-init-order.md` but doesn't exist
  in the checkout (not part of `npm run lint`). Worth a TODO or a doc fix.

## CONSTRAINTS & PREFERENCES
- Start replies with `🔋Mike:`. Terse, no preamble or recap. Use `file://` links.
- Red test first for any `src/*.js` fix. Every catch rethrows or calls `console.error` with the stack.
- `gas-app/*.gs`: IIFE plus explicit exports with a per-export comment; top-level globals must be literals only.
- Commit straight to the working branch and push to `origin/pure-gas-main`. No PRs.
- Use tier subagents (`lite`/`worker`/`deep`) with model and effort set explicitly.

## OPEN THREADS (THE 3 MOST IMPORTANT TASKS)
1. **L5 baseline** ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) line 16): user-blocked on freshly
   labelled `🎯/` threads; must run before the rpc login dies **2026-10-17**.
2. **`src/integration/sheetRanges.js`** ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) line 19,
   [`PLAN.md`](file:///home/mike/projects/day-planner/PLAN.md) line 73): pure A1/tab-quoting/ValueRange helpers,
   node-tested, built into Engines.gs, replacing the copies in Config.gs and LedgerRepository.gs.
3. **Phase 28 live `/dev` checks and the 7-day Testing expiry watch**
   ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) lines 31-38).

User-blocked / time-gated: L5 baseline (labelled threads, before 2026-10-17); pinned prod `/exec` deploy and WORK
promotion only on the user's go; WORK `/exec` repoint (GSA account only).

## IMMEDIATE NEXT STEP
Ask: "Have you labelled fresh `🎯/` threads for the L5 baseline?" If not, create `tests/sheetRanges.test.js` with
red cases for `colLetter(27) === 'AA'` and quoting `O'Brien` → `'O''Brien'!A1`.
