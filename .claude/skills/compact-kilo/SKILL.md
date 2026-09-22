---
name: compact-kilo
description: Compact the project memory and session context for day-planner.
tags: [compact, memory, context, session, day-planner]
version: 2.1.0
---

# Compact-Kilo Skill — Context Optimization

Summarizes the current state of `day-planner` session, open items in `PLAN.md`, status of `src/`, and active test results to minimize token usage.

## Harness Routing
- **In Antigravity CLI (`agy`)**: Dispatch a Tier 3 subagent via `invoke_subagent(Model="flash_lite", Role="Context Compactor", Prompt="Run node tools/status.js and summarize active context into CONTEXT.md")`. This avoids burning Tier 1/2 tokens or local RAM.
- **In Claude Code CLI (`claude`)**: Execute `node tools/status.js` directly.

## Execution
```bash
node tools/status.js
```
