<!-- handoff: branch=worktree-drive-grant-picker worktree=/home/mike/projects/day-planner/.claude/worktrees/drive-grant-picker base=a9f2813286df written=2026-10-10T19:16:14-07:00 -->
# Resume: Drive grants restored; Phase 29 step 0 half done (run outcome fixed), next is the Sheets read/write meter

> **WARNING: written on branch `worktree-drive-grant-picker`** (worktree
> `/home/mike/projects/day-planner/.claude/worktrees/drive-grant-picker`). Every commit was also pushed to
> `origin/pure-gas-main`, but the main checkout's local `pure-gas-main` is behind (`8974ad8`). Update it:
> `git -C /home/mike/projects/day-planner pull --ff-only`

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
This prompt is stale if that commit is dated after `2026-10-10T19:16:14-07:00` **and** its parent (2nd field) isn't
`a9f2813286df`, or if `git worktree list` shows a worktree whose `HANDOFF.md` stamp has a later `written=`. If stale,
read `git show <1st field>:HANDOFF.md` (or that worktree's file), use it instead, and tell the user. Then run
`git log --oneline a9f2813286df..origin/pure-gas-main`: any commit besides the handoff commit means work landed after
this prompt, so check it before redoing anything.

**Start by:** Phase 29 step 0 meter, red test first (checklist in `TODO.md` "Phase 29 step 0"): add a Sheets
read/write meter on `DPConfig`, used by every `Sheets.Spreadsheets.*` call in `gas-app/Config.gs` and
`gas-app/LedgerRepository.gs`. Reset it at the top of `runQueue` (`gas-app/QueueProcessor.gs`) and report
`counts.sheetsReads`/`counts.sheetsWrites`. Red test: a `realStores` run whose meter totals equal
`ctx.__fakes.sheetsCalls` bucketed the same way.

This session: HOME's link to GCP `day-planner-507615` had dropped `drive.file` write grants on older app files. The
`?view=regrant` Google Picker page restored them: probe `unwritable: []`, L5 created 3 Tasks with 0 errors, and a Daily
Note save in the `2026` subfolder persisted. Then Phase 29 started (user go): a queue run with failed items now returns
`ok:false`, lists each failure in `errors`, and has status `DONE`/`PARTIAL`/`FAILED` with a message leading
"N of M items failed". gas-rpc exits 1 on `ok:false`. Policy change: test on `/dev` only; the pinned prod `/exec`
deploy waits for release and the user's go.

- What changed: `TODO_HISTORY.md` "2026-10-10 — Drive grants restored…"
- Plan: `PLAN.md` Phase 29 (In Progress)
- Still open: `TODO.md` "Phase 29 step 0" (meter, then L5 baseline) and Phase 28's remaining items

User-blocked / time-gated:
- L5 baseline needs `DRY_RUN` FALSE plus labelled threads, and must run before the rpc login dies on **2026-10-17**.
- Pinned prod `/exec` deploy and WORK promotion happen only on the user's go.
