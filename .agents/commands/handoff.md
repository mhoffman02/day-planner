---
description: Generate end-of-session handoff — runs tests, reviews uncommitted changes, updates PLAN.md status, writes CONTEXT.md, commits
---

Run the following steps in order:

**Step 1 — Tests**
```bash
npm test
```
Fix any failures before proceeding.

**Step 2 — Code review** (uncommitted changes)

Use `/code-review` against the current diff and address any blocking findings before
committing.

**Step 3 — Reconcile PLAN.md**

If this session's TodoWrite list has completed items not yet reflected in `PLAN.md`'s
checklist (`- [ ]` / `- [x]`), check them off (or add new lines under the relevant
phase) by hand — `tools/handoff.js` only reads what's on disk in `PLAN.md`, it has no
access to the in-memory TodoWrite list.

**Step 4 — Handoff**
```bash
node tools/handoff.js
```
Reads state from git and `PLAN.md`, writes `CONTEXT.md` with a resume summary, and
commits only that file. Anything else left in the working tree is reported, not
committed — commit that separately with its own message.

**Variant:** `node tools/handoff.js --read-only` — preview without writing or committing.
