<!-- handoff: branch=pure-gas-main worktree=/home/mike/projects/day-planner base=4676868db286 written=2026-11-12T12:32:52-08:00 -->
# Resume: Attendees + hover popovers shipped (HOME @435, WORK pushed); verified on WORK 2026-11-12

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-12T12:32:52-08:00` **and** its parent isn't `4676868db286`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline 4676868db286..origin/pure-gas-main`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** agent work: (1) PLAN.md Phase 30 OVERDUE rpc-token check (`npm run rpc -- getHubStatus`, read-only); (2) TODO.md A10 item 2, diagnose why `npm run smoke` fails on clean HEAD (thrown at `tools/smoke-test.js` ~L150; use `tools/ensure-chrome.js http://localhost:3000` + `tools/probe-live.js`, red test or repro first), then verify the local-preview `index.html` port. User-gated items below are listed separately.

This session added Attendees to the appointment modal and hover popover (`guestList_` in `gas-app/Code.gs`, `measureGuests`/`guestMark` in `src/app.js` mirrored in `gas-app/Script.html`), hover popovers on appointment pills and Today/Master task titles, the pill-to-popover roll fix (`openNotesPopover` `wasOpen` guard), and `--password-store=basic` for headless Linux Chrome in `tools/smoke-test.js` and `tools/audit-wcag-responsive.js`. Lint clean, 2210 tests pass.

User items (WORK repoint and popover/Attendees checks done 2026-11-12), with my recommendation:
1. Older hand-checks still open: A9 slot click, A6 (unreproduced Task Today/Later lock), A7/A8 WORK checks. Recommend as in the prior handoff.

- What changed: TODO.md (A10 added), LEARNINGS 2026-11-12.
- Still open: TODO.md "Agent work" (A0, A5, A6, A7, A8, A9, A10) and "For the session after next" (B1/B3/B4, user present).
- Traps: edits to `src/app.js` need the same edit in `gas-app/Script.html` (and `src/styles.css` in `gas-app/Styles.html`); in `gas-app/*.html` never put `//` in strings or apostrophes in comments; `soc/inline-style-binding` baseline is 10 for gas-app/Index.html (11 for index.html), so no new `:style` there. Never run `pkill -f "node server.js"` (killed the shell). Run `git status .claude .kilo` before `npm run sync:agents`. A live CDP check must reload the Day Planner tab first.
