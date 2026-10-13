<!-- handoff: branch=worktree-hub-link-tutorial worktree=/home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial base=6d38b2861d7d written=2026-10-13T07:49:27-07:00 -->
# Resume: Triage speed, Gmail quota and Inbox-only live on WORK v145; what's left needs the user

> **WARNING: written on branch `worktree-hub-link-tutorial`** (worktree
> `/home/mike/projects/day-planner/.claude/worktrees/hub-link-tutorial`), not `pure-gas-main`. Every commit was pushed
> to `origin/pure-gas-main`, but the main checkout (`pure-gas-main` at c6d0df4) is behind until you pull:
> `git -C /home/mike/projects/day-planner pull --ff-only`
> `pure-gas-main` is the working branch (CLAUDE.md rule 5). `master` has diverged on purpose, so don't merge into it.

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
This prompt is stale if that commit is dated after `2026-10-13T07:49:27-07:00` **and** its parent (2nd field) isn't
`6d38b2861d7d`, or if `git worktree list` shows a worktree whose `HANDOFF.md` stamp has a later `written=`. If stale,
read `git show <1st field>:HANDOFF.md` (or that worktree's file), use it instead, and tell the user. Then run
`git log --oneline 6d38b2861d7d..origin/pure-gas-main`: any commit besides the handoff commit means work landed after
this prompt, so check it before redoing anything.

**Start by:** ask the user to decide what's next. Every open item needs them:
- **WORK trial mode off**: use Triage > Review and go live on WORK when ready, or keep trial mode.
- **WORK Meeting Prep**: set `NCMMS_CORE_PILOT` TRUE and fill the NCMMS-Core notes Doc, then the agent checks (T14).
- **HOME live check of the trial-mode controls** (banner, dialog, Undo, two-tab MODE_CHANGED refusal).
- **7-day Testing expiry** on 2026-10-17 (rerun the rpc login, check the web app and sync trigger).
- **UAT T01-T15**, or pick the next phase.

This session built the in-app trial-mode controls, then sped up Triage after live WORK feedback: Gmail snippet
preview, an instant board from a saved copy, a Gmail-quota throttle, a server row cache keyed on Gmail `historyId`,
instant Archive, and Inbox-only listing. WORK v145 (build 483) is live and the user confirmed it ("Looks good!").

- What changed — `TODO_HISTORY.md`'s "2026-10-13 — Hub Triage: trial-mode controls, speed, Gmail quota, Inbox only"
- Rationale — commit messages `6077c04`, `34d4bee`, `6d38b28`; `docs/hub-architecture.md` safety point 4 (what is
  stored: snippet in CacheService for 6 h, last board in the tab's sessionStorage, never bodies)
- Still open — `TODO.md`'s "Phase 30: WORK promotion & user-gated release items", including the new **Gmail quota
  watch** (the background queue job pages every 🎯/-labelled thread, archived ones too)
- Push HOME with `cd gas-app && npx clasp --auth ~/.clasprc.home.json push -f`; a push from the repo root uploads
  files under a `gas-app/` prefix and breaks `include()`.
