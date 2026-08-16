---
name: handoff
description: Generate end-of-session handoff — runs tests (npm test), updates PLAN.md, writes CONTEXT.md, and updates status.
tags: [handoff, session, context, plan, day-planner]
version: 2.0.0
---

# Handoff Skill — End-of-Session Wrap-Up

Executes end-of-session procedures for `day-planner`:

1. Run unit test suite:
   ```bash
   npm test
   ```
2. Run handoff tool:
   ```bash
   node tools/handoff.js
   ```
3. Update `PLAN.md` checklist items.
4. Summarize uncommitted changes and next steps for the user.
