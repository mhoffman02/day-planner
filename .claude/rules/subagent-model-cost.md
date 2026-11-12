# Subagents: Least Estimated-Cost Capable Model AND Effort

- MUST set BOTH model and reasoning effort explicitly on every subagent/delegation. Never let either
  inherit the session's (often the most expensive) setting.
- MUST pick the cheapest model + lowest effort expected to finish the task correctly on the first try:

| Task shape | Claude tier agent (model / effort) | Headless claude | AGY |
| :--- | :--- | :--- | :--- |
| Search/scout, grep sweeps, summaries, commit digests, doc pointer checks, renames, single-function edits to a clear spec, running tests/lint and reporting | `lite` (haiku / medium) | `--model haiku --effort medium` | `flash_lite` |
| Mechanical edits needing some judgment (lint/catch sweeps, tests to a clear spec, wiring) | `worker` (sonnet / medium) | `--model sonnet --effort medium` | `flash` |
| Architecture, OAuth/security, adversarial review, subtle data-loss/concurrency fixes | `deep` (opus / high) | `--model opus --effort high` | `pro` |

- Never run Haiku at `low` effort: Anthropic's Haiku 5.5 guide says `low` skips checks and stops early in long
  agent prompts, and `medium` is its default for agentic coding. `lite` is `medium`. A multi-file wiring job (client
  mirrors, quota or cooldown logic) goes to `worker`; run it at `high` effort (headless `--effort high`) only when
  `medium` failed its exit criteria. Avoid `xhigh`/`max` on Haiku (empty replies at `xhigh`).
- Claude's `Agent` tool has no effort parameter; effort comes from the agent definition. So spawn via
  `subagent_type: "lite" | "worker" | "deep"` (user-level `~/.claude/agents/*.md`, model + effort pinned in
  frontmatter). Do not use `general-purpose` with a `model` override: that pins model but not effort.
- Subagents MUST NOT call the advisor tool (an Opus agent consulting an Opus advisor pays twice for the
  same judgment). Tier agents set `disallowedTools: advisor`; a lower tier that needs more judgment
  reports "needs a higher tier" instead. Only the orchestrating session uses the advisor.
- State the chosen tier (model/effort) and a one-line reason when spawning.
- A tier that fails its exit-criteria tests is retried one tier up; do not start at the top "to be safe".
- Every background subagent that may run over about 5 minutes MUST be told to keep a status log: after each step,
  append one line to `$CLAUDE_JOB_DIR/tmp/agents/<agent>.log` (`mkdir -p` first; per-agent single writer; the agent
  trims its own file to the last 200 lines):
  `<local YYYY-MM-DD HH:mm:ss> <agent> <phase edit|verify|commit|done|BLOCKED> <done>/<total> <note>`
  and write phase `BLOCKED` with the command if any command runs over 5 minutes. The orchestrator runs
  `npm run agent:status` (`tools/agent-status.js`): last line per agent, clock as `hh:mm:ss am|pm`, age `mm:ss`,
  `STALE` when age > 10:00 and phase is not `done`, plus the age of the `<agent>.beat` heartbeat that the
  `tools/agent-heartbeat.js` PostToolUse hook writes. Report the `done/total` count, never a time estimate (the
  pace-based guess is unreliable). A running agent only reads messages between tool calls, so SendMessage is not
  a liveness test.
- `Explore`, `general-purpose`, `Plan` and `claude` agents inherit the session model and cannot pin effort: do not use
  them for scouting. Use `lite`. Same for forks (`subagent_type: "fork"` always runs on the session model).
- Orchestrator monitoring: MUST NOT stop an agent for being quiet or slow. `deep` (Opus) legitimately runs 20+ minutes
  between visible writes. Judge liveness by the status file, then by `git status`/`git diff --shortstat` and the task
  metric (for example the `!important` count) across at least two checks several minutes apart. Stop one only when the
  status file says `BLOCKED`, the metrics stay frozen across 3 checks about 10 minutes apart with no status update, or
  the user says so. Before stopping, ask the user. Report to the user the metric and its change, never a guessed ETA.
- Every subagent prompt MUST carry exit criteria: concrete commands plus expected results (full test suite, lint,
  task-specific gate). The agent reports evidence lines, not "done".
- Every subagent works TDD: a behavior change or bug fix starts with a red test that fails for the diagnosed
  reason, then green, then the full suite; never weaken a test to pass (see [[test-before-fix]]).
- The tier agents (`lite`/`worker`/`deep`) bake both requirements into their definitions; if a prompt omits
  exit criteria they must write them first. Fail-loud applies too (see [[fail-loud-catch]]).

**Why:** on 2026-10-09 three mechanical catch-sweep agents ran on Opus by inheritance. The user's rule:
"go with the least est. cost capable agent."
