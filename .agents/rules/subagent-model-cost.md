# Subagents: Least Estimated-Cost Capable Model AND Effort

- MUST set BOTH model and reasoning effort explicitly on every subagent/delegation. Never let either
  inherit the session's (often the most expensive) setting.
- MUST pick the cheapest model + lowest effort expected to finish the task correctly on the first try:

| Task shape | Claude tier agent (model / effort) | Headless claude | AGY |
| :--- | :--- | :--- | :--- |
| Search/scout, grep sweeps, summaries, commit digests, doc pointer checks, simple renames | `lite` (haiku / low) | `--model haiku --effort low` | `flash_lite` |
| Mechanical edits needing some judgment (lint/catch sweeps, tests to a clear spec, wiring) | `worker` (sonnet / medium) | `--model sonnet --effort medium` | `flash` |
| Architecture, OAuth/security, adversarial review, subtle data-loss/concurrency fixes | `deep` (opus / high) | `--model opus --effort high` | `pro` |

- Claude's `Agent` tool has no effort parameter; effort comes from the agent definition. So spawn via
  `subagent_type: "lite" | "worker" | "deep"` (user-level `~/.claude/agents/*.md`, model + effort pinned in
  frontmatter). Do not use `general-purpose` with a `model` override: that pins model but not effort.
- Subagents MUST NOT call the advisor tool (an Opus agent consulting an Opus advisor pays twice for the
  same judgment). Tier agents set `disallowedTools: advisor`; a lower tier that needs more judgment
  reports "needs a higher tier" instead. Only the orchestrating session uses the advisor.
- State the chosen tier (model/effort) and a one-line reason when spawning.
- A tier that fails its exit-criteria tests is retried one tier up; do not start at the top "to be safe".
- Every subagent prompt MUST carry exit criteria: concrete commands plus expected results (full test suite, lint,
  task-specific gate). The agent reports evidence lines, not "done".
- Every subagent works TDD: a behavior change or bug fix starts with a red test that fails for the diagnosed
  reason, then green, then the full suite; never weaken a test to pass (see [[test-before-fix]]).
- The tier agents (`lite`/`worker`/`deep`) bake both requirements into their definitions; if a prompt omits
  exit criteria they must write them first. Fail-loud applies too (see [[fail-loud-catch]]).

**Why:** on 2026-10-09 three mechanical catch-sweep agents ran on Opus by inheritance. The user's rule:
"go with the least est. cost capable agent."
