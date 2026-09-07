---
name: handoff
description: Generate end-of-session handoff — runs lint + tests, code review, updates PLAN.md, writes HANDOFF_PROMPT.md, copies to clipboard, commits
tags: [handoff, session, git, plan, day-planner]
version: 2.0.0
---

# Day Planner Session Handoff Skill

Run the following steps in order:

**Step 1 — Lint & Tests**
```bash
npm run lint
npm test
```
Fix any errors or test failures before proceeding. Warnings are informational only.

**Step 2 — Code review** (uncommitted changes)

If there are uncommitted working-tree changes, run the code review skill:
```
/review
```
Address any HIGH or BLOCKER findings before committing.

> [!IMPORTANT]
> **Commit working-tree changes first**: If there are code, test, or config changes in the working tree, commit them separately with a truthful conventional commit message (e.g. `feat(...)`, `fix(...)`, `test(...)`) before proceeding to handoff. Handoff stages and commits **only the files it writes** (`docs(handoff)`). It does not bury code changes under handoff commits.

**Step 3 — Sync this session's tasks into PLAN.md**

`tools/handoff.js` derives the handoff prompt's "Open Checklist Items" from PLAN.md `- [ ]` checklist lines.
Reconcile this session's completed and pending items before running Step 4:
1. Review the session's completed work and upcoming tasks.
2. For completed items: if `PLAN.md` has matching open lines, flip `- [ ]` to `- [x] <task> (YYYY-MM-DD)`. Or use:
   ```bash
   node tools/handoff.js --completed="task title 1|task title 2"
   ```
3. For pending follow-up work: add `- [ ] <task>` lines under `## Verification Criteria`, `## Feature Backlog`, or an active phase.
4. Record any major architectural updates in `PLAN.md` or `LEARNINGS.md`.

**Step 4 — Handoff**
```bash
node tools/handoff.js
```

No arguments required — the script reads all state from git and `PLAN.md` automatically:
- Updates `CONTEXT.md` and `HANDOFF_PROMPT.md`.
- Copies the resume prompt to the system clipboard.
- Stages and commits **only the files it wrote** (`CONTEXT.md`, `HANDOFF_PROMPT.md`, and `PLAN.md` if modified by `--completed`).
- Pushes the handoff commit to remote origin.
- Reports any leftover uncommitted files in the working tree so they can be committed separately with their own truthful message.

**Step 5 — Prune branches (report-only)**
```bash
node tools/prune-branches.js
```
Reports merged worktrees/branches left over from finished sessions and whether local `master` is behind `origin/master`. This step only reports — see `/prune-branches` for interactive cleanup.

**Variants:**
- `node tools/handoff.js --read-only` — generate and display the prompt without committing or writing files.
- `node tools/handoff.js --preflight` — report whether the working tree has changes (`NOOP`, `FILES_CHANGED`, `SKIP_REVIEW`).
