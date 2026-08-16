---
name: compress
description: Generate compact resume prompt for session restart (Gemini/Claude compatible) — 95%+ token reduction for day-planner.
tags: [compress, resume, prompt, context, day-planner]
version: 2.0.0
---

# Compress Skill — Session Resume Prompt Generator

Generates a minimal, token-efficient resume prompt summarizing:
1. Current branch & git commit.
2. Active task progress in `PLAN.md`.
3. Open blockers in `src/`, `gas-app/`, or `tests/`.
4. Next recommended steps.
