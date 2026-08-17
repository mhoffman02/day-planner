---
name: handoff
description: Generate end-of-session handoff — runs git add, commit (triggers pre-commit linter/test hook), git push, updates PLAN.md/CONTEXT.md, writes HANDOFF_PROMPT.md, copies to clipboard, and instructs user to run /new.
tags: [handoff, session, context, plan, day-planner]
version: 2.1.0
---

# Day Planner Handoff Skill — End-of-Session Wrap-Up

Executes automated end-of-session procedures for `day-planner`:

1. **Run Handoff Workflow**:
   ```bash
   node tools/handoff.js
   ```

2. **Automated Sequence Executed**:
   - **`git add .`**: Stages all working tree changes.
   - **`git commit`**: Triggers pre-commit linter & unit test hook (`.git/hooks/pre-commit`). Clean up findings if linting fails.
   - **`git push`**: Pushes committed changes to `origin master`.
   - **Update `PLAN.md` & `CONTEXT.md`**: Synchronizes session status and checklist progress.
   - **Generate `HANDOFF_PROMPT.md`**: Builds comprehensive resume prompt for the next session.
   - **Clipboard Copy**: Copies `HANDOFF_PROMPT.md` directly to system clipboard.

3. **User Guidance**:
   - Inform the user that the handoff prompt is on the clipboard.
   - Instruct the user to issue the `/new` command to start the next session.
   - Instruct the user to paste the clipboard contents into the new session.
