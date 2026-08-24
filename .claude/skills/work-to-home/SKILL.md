---
name: work-to-home
description: Transfer day-planner session state between environments (WSL2, Git Bash, Claude Code, Gemini CLI).
tags: [work-to-home, handoff, environment, sync, day-planner]
version: 2.0.0
---

# Work-to-Home Session Transfer Skill

Transfers `day-planner` development context across environments:
1. Run `node tools/handoff.js` to write `CONTEXT.md` and commit changes.
2. Push git branch to origin.
3. Resume session in destination environment by inspecting `CONTEXT.md` and `PLAN.md`.
