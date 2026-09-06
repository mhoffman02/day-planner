---
name: simplify
description: Three-perspective code review (Code Reuse · Quality · Efficiency) with optional auto-apply for day-planner.
tags: [simplify, refactor, quality, efficiency, day-planner]
version: 2.2.0
---

# Simplify Code Review Skill

Default scope: uncommitted changes (`git diff`). Only sweep the full `src/` tree (4,871
lines across 11 files) when explicitly asked for a full-codebase pass.

## Harness Routing
- **In Antigravity CLI (`agy`)**: Dispatch a Tier 1 subagent via `invoke_subagent(Model="pro", Role="Code Simplifier", Prompt="...")` to evaluate non-trivial refactors.
- **In Claude Code CLI (`claude`)**: For non-trivial refactor evaluation, dispatch the
  `architecture-advisor` subagent (`.claude/agents/architecture-advisor.md`, Opus, read-only) via
  the Agent tool. For small/local simplifications, evaluate directly using Claude Sonnet 5 / Opus 5.

## Perspectives Analyzed
- **Code Reuse**: Consolidating duplicate date/time formatters, storage keys, or task status helpers across `src/`.
- **Quality**: Improving error boundary handling, null checks, and edge-case coverage.
- **Efficiency**: Optimizing search index traversal and event overlap computations in `calendarEngine.js` and `searchEngine.js`.
