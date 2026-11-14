<!-- handoff: branch=worktree-notes-topic-picker worktree=/home/mike/projects/day-planner/.claude/worktrees/notes-topic-picker base=06639ab544f4 written=2026-11-14T13:59:42-08:00 -->
# Resume: Notes/Tasks pickers, quiet header and note tab-sync shipped (HOME @457, WORK v254); next agent work is the smoke diagnosis

> **WARNING: written on branch `worktree-notes-topic-picker`** (worktree `/home/mike/projects/day-planner/.claude/worktrees/notes-topic-picker`), not
> `pure-gas-main`. Until it lands, `pure-gas-main`'s copy is stale. The code commits are already on `pure-gas-main` as cherry-picks
> (`fcc6fef`..`0b9c4e8`), so the branches have diverged and a fast-forward merge fails. Land the retro (`06639ab`) and this
> handoff commit (the branch tip) with:
> `git -C /home/mike/projects/day-planner cherry-pick 06639ab worktree-notes-topic-picker`

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-14T13:59:42-08:00` **and** its parent isn't `06639ab544f4` (or, after the cherry-pick, isn't the cherry-picked retro commit), or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline 0b9c4e8..pure-gas-main`: any commit besides the retro and handoff cherry-picks landed after this prompt; check it first.

**Start by:** TODO.md A10 first bullet: diagnose why `npm run smoke` fails on clean HEAD (the `throw` in `tools/smoke-test.js` ~L150, "Alpine app failed to initialize on localhost:3000 within 6s"). The script does not start the server: run `npm start` first, then `node tools/ensure-chrome.js http://localhost:3000` + `tools/probe-live.js`; repro or red test before any fix.

This session shipped: the Notes Topic picker shares the Tasks category list (`src/topicPicker.js`; the live picker had been dead because `gas-app/Script.html` lacked its handlers, now guarded by `tests/appScriptMethodParity.test.js`); Tasks Category and Notes Topic boxes clear on focus and on a second click while focused; a "quiet library" header (date at title size, gold weekday, icons bare until hover); and tabs sharing confirmed note saves over a BroadcastChannel (`src/noteTabSync.js`) so an idle tab no longer reports a false "changed in Google Docs" conflict. Lint clean, 2497 tests pass; HOME @457, WORK v254 (user updated).

- What changed: TODO_HISTORY.md 2026-11-14 and 2026-11-13 (the 11-13 security/toast session wrote no handoff; entry built from git log), TODO.md A12 (new, user hand-check), PLAN.md Phase 30 (gas-rpc 7-day notes item closed: already gone).
- Still open: TODO.md "Agent work" (agent: A10 smoke and ensure-chrome bullets, A0, A5, A8 easing; A3 has no agent work left, both items are baselined by user decision; user hand-checks: A6, A7, A9, A11, A12) and "For the session after next" (B1/B3/B4, user present).
- User items, with my recommendation:
  1. A12: open today in two HOME tabs, type in A, wait 2 s, type in B; expect no conflict warning. Recommend T (optional, 1 min).
  2. A11: remove the three unused claude.ai connectors and re-run `/usage` due 2026-11-19. Recommend T.
- Traps: edits to `src/app.js` need the same edit in `gas-app/Script.html` (`styles.css` in `Styles.html`); in `gas-app/*.html` no `//` in strings and no apostrophes, backticks or `//` in comment prose. Python patch scripts: check every anchor exists in both files before writing any (one aborted halfway this session). Never put a BroadcastChannel or other host object on Alpine state (the proxy breaks `postMessage`); close over it. Start a session's worktree from `pure-gas-main`, not `master`. Use `globalThis.BroadcastChannel` (ESLint `no-undef`). A live CDP check must reload the Day Planner tab first.
