<!-- handoff: branch=handoff-guard worktree=/home/mike/projects/day-planner/.claude/worktrees/notes-topic-picker base=af7ccb06233f written=2026-11-14T14:40:50-08:00 -->
# Resume: one landing path guard, lighter handoff, quiet Future year nav and [+] shipped (HOME @458); next agent work is TODO.md A12

> Written on worktree branch `handoff-guard` and pushed as `HEAD:pure-gas-main` (one landing path). The main checkout is stale until: `git -C /home/mike/projects/day-planner pull --ff-only`

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-14T14:40:50-08:00` **and** its parent isn't `af7ccb06233f`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline af7ccb06233f..origin/pure-gas-main`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** TODO.md A12 first bullet (agent, default do): drop the unreachable CalendarApp-style branches (`getHangoutLink` and the other function checks) in `extractMeetLinkFromEvent_` (`gas-app/Code.gs` ~L1176; only caller `mapCalendarApiEvent_` ~L1221 passes raw Calendar API events). No test covers it: first add hangoutLink, conferenceData and description-only cases to `tests/editCalendarEvent.test.js` and see them pass on the current code, then remove the branches, then `npm run deploy:home`. Next: A12 second bullet (`npm audit` dev upgrades), then A10 (`npm run smoke` fails on clean HEAD; throw in `tools/smoke-test.js` ~L150; run `npm start` first).

This session (after the 14:20 handoff): `npm run check:handoff` fails and `npm run deploy:home` refuses while GitHub `pure-gas-main` has commits HEAD lacks (`tools/landing-branch.js`); the shared handoff skill gained `/handoff light`, a retro skip, a fresh-eyes skip and a mandatory remote check. The Future tab year nav now matches the date header (serif year, gold hairline, bare chevrons, "This Year" link only off the current year via `isOffCurrentFutureYear`), and every [+] on Today and Master uses the Future tab's quiet tinted `.btn-add-quiet`. Lint clean, 2503 tests pass; HOME @458 (deploy gate passed, including the new guard).

- What changed: TODO_HISTORY.md "2026-11-14 (later)"; TODO.md A14 (new user hand-check).
- Still open: TODO.md "Agent work" (agent: A12 first two bullets, A10 smoke and ensure-chrome, A0, A5, A8 easing; user: A6, A7, A9, A11, A13, A14 and the A12 user lines) and "For the session after next" (B1/B3/B4, user present).
- User items, with my recommendation:
  1. A14: look at the Future year nav and [+] buttons in light and dark on HOME @458; repoint WORK to the newest version (`push:work` ran twice, two identical versions). Recommend T.
  2. A12: hand-check task-to-calendar title sync on an old event; keep `drive.readonly` (recommend keep); delete `PICKER_API_KEY` once the Drive re-grant TODO closes; remove the `retro-sec` worktree. Recommend T.
  3. A13 (optional) two-tab check; A11 connectors and `/usage` due 2026-11-19. Recommend T.
- Traps: edits to `src/app.js` need the same edit in `gas-app/Script.html` (`styles.css` in `Styles.html`, and markup in both `gas-app/Index.html` and the mock `index.html`). In `gas-app/*.html` no `//` in strings and no apostrophes, backticks or `//` in comment prose. The worktree guard refuses compound git commands, `sed` with computed args and git text in heredocs: use single commands and the Edit/Write tools. Never put a BroadcastChannel or other host object on Alpine state. New worktrees start from `master`: `git switch -c <name> origin/pure-gas-main` first. No screenshot tool exists in `tools/`: CSS changes are checked only by the deploy load and axe, so ask the user to look. Never rerun `npm run push:work` just to read its output (each run creates a WORK version).
