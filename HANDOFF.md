<!-- handoff: branch=pure-gas-main worktree=main-checkout base=c5fda9af67d5 written=2026-10-12T09:00:02-07:00 -->
# Resume: WORK v132 live, HOME hub trigger on, About rewritten; what's left needs the user

> `pure-gas-main` is the working branch (CLAUDE.md rule 5). `master` has diverged on purpose, so don't merge into it.

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
This prompt is stale if that commit is dated after `2026-10-12T09:00:02-07:00` **and** its parent (2nd field) isn't
`c5fda9af67d5`, or if `git worktree list` shows a worktree whose `HANDOFF.md` stamp has a later `written=`. If it's
stale, read `git show <1st field>:HANDOFF.md`, use that instead, and tell the user. Then run
`git log --oneline c5fda9af67d5..origin/pure-gas-main`. Any commit there besides the handoff commit is work that landed
after this prompt.

**Start by:** asking the user to decide:
- (a) Are `GMAIL_ROUTER` and `NCMMS_CORE_PILOT` now TRUE in WORK's Hub Config Sheet? If yes, open WORK `/exec`
  (`AKfycbzDYvr…`) Meeting Prep with `node tools/eval-console.js --tab AKfycbzDYvr --iframe ...` and check the
  carry-in count matches the Doc.
- (b) Run `npm run push:work` to ship builds 456–461 (the About rewrite) to WORK? The user then redeploys in the WORK
  IDE. WORK is on build 455.
- (c) What should the next phase be? No agent work is queued.

On 2026-10-17, rerun the rpc login (7-day Testing expiry) and check the HOME web app and `hubDispatch` still authorize.

**This session:**
- The user deployed WORK v132. The working `/exec` ID replaced the dead `…BhslA` one in the gas-environments rule and
  in `tools/promote-to-work.js`.
- `installHubTriggers` ran on HOME. HOME has `GMAIL_ROUTER` on and `DRY_RUN` off, so it acts on real 🎯 labels.
- The About page now has a sticky jump nav plus Tag Reference and Automatic Tasks tables; the install steps collapse.
  This was checked in local preview only. HOME `/dev` returns "Page Not Found" in the CDP Chrome profile while it is
  also signed into GSA.
- `eval-console`, `probe-live` and `read-console` now attach only to the target tab's own iframe.

- Closed: [`TODO_HISTORY.md`](file:///home/mike/projects/day-planner/TODO_HISTORY.md) 2026-10-12 entry.
- Still open: [`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) Phase 30. Everything there needs the user:
  test-data cleanup, the expiry watch, and the WORK Meeting Prep render.
- Plan: [`PLAN.md`](file:///home/mike/projects/day-planner/PLAN.md) §3 Phase 30.
