---
name: handoff
description: Generate end-of-session handoff — runs git add, reviews/fixes findings by severity rating, commits (triggers pre-commit linter/test hook), git push, updates PLAN.md/CONTEXT.md, writes HANDOFF_PROMPT.md, copies to clipboard, and instructs user to run /new.
tags: [handoff, session, context, plan, day-planner]
version: 2.2.0
---

# Day Planner Handoff Skill — End-of-Session Wrap-Up

Executes automated end-of-session procedures for `day-planner`:

1. **Run Handoff Workflow**:
   ```bash
   node tools/handoff.js
   ```

2. **Automated Step-by-Step Sequence Executed**:
   - **Step 1 — `git add .`**: Stages all working tree changes.
   - **Step 1.5 — Fix Findings (by Severity Rating)**:
     - Runs pre-commit linter & static checks.
     - Reports findings categorized by severity rating (`[BLOCKER]`, `[HIGH]`, `[MEDIUM]`, `[LOW]`).
     - Automatically cleans up and resolves fixable findings (e.g. missing JSDoc `@file` headers, formatting), then re-stages fixed files.
   - **Step 2 — `git commit`**: Triggers pre-commit linter & unit test hook (`.git/hooks/pre-commit`). Halts with report if `[BLOCKER]` unit test failures occur.
   - **Step 3 — `git push`**: Pushes committed changes to remote `origin master`.
   - **Step 4 — Update `PLAN.md` & `CONTEXT.md`**: Synchronizes session status and open checklist progress.
   - **Step 5 — Generate `HANDOFF_PROMPT.md`**: Builds comprehensive resume prompt for the next session.
   - **Step 6 — Clipboard Copy**: Copies `HANDOFF_PROMPT.md` directly to system clipboard.
   - **Step 7 — User Guidance**:
     - Notifies user: `📋 Handoff prompt copied to clipboard!`.
     - Instructs user to issue `/new` command to start the next session.
     - Instructs user to paste clipboard contents into the new session.
