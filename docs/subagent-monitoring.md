# Subagent status logs and monitoring

Moved out of `.agents/rules/subagent-model-cost.md`. Read before delegating a job over ~5 minutes.

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
