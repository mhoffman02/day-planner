## Project addendum (day-planner)

These override or add to the generic steps above, for this repo only.

- **Default branch is `pure-gas-main`** (CLAUDE.md rule 5), not what Step 5.0 detects (`origin/HEAD` is unset, so the
  generic rule picks `master`, which has diverged on purpose; never merge into it). From a worktree, push the
  handoff with `git push origin HEAD:pure-gas-main`. The warning and the last-line command then become
  `git -C <main_checkout> pull --ff-only`.
- **Tracker docs:** plan doc `PLAN.md`, session-log doc `TODO.md`, retro doc `LEARNINGS.md`, resume prompt
  `HANDOFF.md`. No decisions doc: decisions go in `PLAN.md` and memory.
- **Step 1:** `npm run lint && npm test`, zero errors and zero warnings (CLAUDE.md gotcha 5).
- **Step 3, archive (CLAUDE.md rule 3):** move completed `TODO.md` items to `TODO_HISTORY.md` under a dated entry with
  commit refs, then delete them from `TODO.md`. Move any fully checked `PLAN.md` phase to `PLAN-HISTORY.md`. `PLAN.md`
  keeps the overview, stack table, standing verification criteria and the current or next phase only.
- **Deadlines** in tracker items are written `due YYYY-MM-DD`, so the checker below can find them.
- **Step 5.2 script:** `npm run check:handoff` (`tools/check-handoff.js`). It also fails when this generated skill is
  older than the user skill.
- **Step 5.2 fresh-eyes check:** from Claude, spawn the `lite` agent (haiku/low, per `.agents/rules/subagent-model-cost.md`);
  from agy, `invoke_subagent(Model="flash_lite")`.
- **Build stamp:** the pre-commit hook re-stamps `BUILD_NUMBER_` in `gas-app/Code.gs` on every commit, so the handoff
  commit includes that one-line change. That is expected and is not a buried code change.
- **Reply style:** start with `🔋Mike:`; every file and symbol is a clickable `file://` link (CLAUDE.md rule 7);
  clipboard is `clip.exe < HANDOFF.md` (WSL).
- **Editing this skill:** change `~/.claude/skills/handoff/SKILL.md` (generic) or this file (day-planner), then run
  `node tools/sync-handoff-skill.js && npm run sync:agents`. Never edit the generated `SKILL.md` by hand.
