# Subagents: Cheapest Capable Model AND Effort

Set BOTH model and effort on every subagent; never inherit the session's. Pick the cheapest tier expected to pass first try. State tier + one-line reason when spawning.

| Task | Tier agent (model/effort) | Headless claude | agy |
| :--- | :--- | :--- | :--- |
| Search/scout, grep sweeps, summaries, commit digests, doc pointer checks, renames, single-function edits to a clear spec, run tests/lint and report | `lite` (haiku/medium) | `--model haiku --effort medium` | `flash_lite` |
| Mechanical edits needing judgment (lint/catch sweeps, tests to a spec, wiring) | `worker` (sonnet/medium) | `--model sonnet --effort medium` | `flash` |
| Architecture, OAuth/security, adversarial review, subtle data-loss/concurrency | `deep` (opus/high) | `--model opus --effort high` | `pro` |

- Spawn via `subagent_type: "lite"|"worker"|"deep"` (effort is pinned in `~/.claude/agents/*.md`; the Agent tool has no effort param). Not `general-purpose` + model override.
- `Explore`, `general-purpose`, `Plan`, `claude`, forks inherit the session model: don't use them for scouting; use `lite`.
- Haiku never at `low` (skips checks) nor `xhigh`/`max` (empty replies). Multi-file wiring goes to `worker`. Go up an effort level only after `medium` failed its exit criteria; a failed tier retries one tier up, never start at the top.
- Subagents never call the advisor (double-paying Opus); a lower tier needing more judgment reports "needs a higher tier". Only the orchestrator consults it.
- Every prompt carries exit criteria: commands + expected results (full suite, lint, task gate); agents report evidence lines, not "done".
- Subagents work TDD ([[test-before-fix]]) and fail loud ([[fail-loud-catch]]); never weaken a test.
- Long jobs (over ~5 min): status log + monitoring in [`docs/subagent-monitoring.md`](../../docs/subagent-monitoring.md). Never stop a quiet agent without asking the user.

**Why:** 2026-10-09 three catch-sweep agents ran on Opus by inheritance. User: "go with the least est. cost capable agent."
