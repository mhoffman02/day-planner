<!-- handoff: branch=pure-gas-main worktree=/home/mike/projects/day-planner base=b1977d216e88 written=2026-11-12T14:27:29-08:00 -->
# Resume: always-loaded context cut ~46 KB to ~20 KB (2026-11-12); layout/table-column work still queued below

**Verify first:**
`git fetch -q; git log --branches --remotes -1 --abbrev=12 --format='%h %p %cI' -- HANDOFF.md`
Stale if that commit is dated after `2026-11-12T14:27:29-08:00` **and** its parent isn't `b1977d216e88`, or a worktree's `HANDOFF.md` has a later `written=`. Then read that copy instead and tell the user. `git log --oneline b1977d216e88..origin/pure-gas-main`: any commit besides the handoff commit landed after this prompt; check it first.

**Start by:** agent work: (1) TODO.md A10 first bullet: diagnose why `npm run smoke` fails on clean HEAD (thrown in `tools/smoke-test.js` ~L150; it does not start the server, so run `npm start` first; local preview is http://localhost:3000, so use `tools/ensure-chrome.js http://localhost:3000` + `tools/probe-live.js`, red test or repro first); (2) PLAN.md Phase 30: drop the 7-day notes in the gas-rpc skill (rpc token check passed 2026-11-12). User-gated items below are listed separately.

This session cut always-loaded context from ~46 KB to ~20 KB: rules rewritten terse, `CLAUDE.md` slimmed (detail in `docs/architecture-and-agent-config.md`), `solid-code` scoped to code paths, subagent monitoring in `docs/subagent-monitoring.md`, memory index hooks shortened, three plugins disabled. New rule: scout with `lite`, never `Explore`/`general-purpose`/forks; handoff archive and tracker sync go to `worker`. Lint clean, 2236 tests pass at b1977d216e88; no code changed.

User items, with my recommendation:
1. TODO.md A11: remove the Play Sheet Music, monday and Postman connectors at claude.ai, and re-run `/usage` due 2026-11-19 to compare. Recommend (a) do both; (b) if "worker" still tops the hints, inspect which sessions spawn it before changing tiers. Answer T/F.
2. Older hand-checks still open: A9 slot click, A6 (unreproduced Task Today/Later lock), A7/A8 WORK checks. Recommend: (a) hand-check A9 and A7/A8 on WORK when next at the WORK PC; (b) A6 stays parked until it reproduces. Answer T/F per item.

- What changed: TODO.md A11 (new, open user items), PLAN.md Phase 30 (rpc token verified), TODO_HISTORY.md (context budget entry), LEARNINGS 2026-11-12 (context budget).
- Still open: TODO.md "Agent work" (A0, A5, A8 open for agents (A3 has no agent work left); A6, A7, A9, A10 hand-check and A11 lines need the user; A10 smoke and ensure-chrome bullets are agent work) and "For the session after next" (B1/B3/B4, user present).
- Traps: edits to `src/app.js` need the same edit in `gas-app/Script.html` (and `src/styles.css` in `gas-app/Styles.html`); in `gas-app/*.html` never put `//` in strings, nor apostrophes, backticks or `//` in comment prose. Never run `pkill -f "node server.js"` (killed the shell). Run `git status .claude .kilo` before `npm run sync:agents`. A live CDP check must reload the Day Planner tab first, via `eval-console.js "location.href=<dev url>"` on the top frame. Edit agent config only in `.agents/`; `paths:` frontmatter scopes a rule to matching files.
