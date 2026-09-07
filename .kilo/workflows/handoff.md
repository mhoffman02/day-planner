---
description: Generate end-of-session handoff — runs lint + tests, reviews uncommitted changes, updates PLAN.md status, writes CONTEXT.md/HANDOFF_PROMPT.md, commits handoff files
---

Run the following steps in order. Steps 0-2 exist to avoid spending tokens on a full
test/review pass when there's nothing to test or review — don't skip straight to Step 3.

**Step 0 — Preflight**
```bash
node tools/handoff.js --preflight
```
Prints `NOOP`, `FILES_CHANGED`, and `SKIP_REVIEW` for the current working tree.
- `NOOP: true` — nothing changed this session. Skip straight to Step 4.
- `SKIP_REVIEW: true` (docs-only diff, or NOOP) — skip Step 2.

**Step 1 — Lint & Tests**
```bash
npm run lint
npm test
```
Fix any failures before proceeding. Skip if Step 0 reported `NOOP: true`.

**Step 2 — Code review** (uncommitted changes)

Use `/review` against the current uncommitted changes and address any blocking findings
before committing. Skip entirely when Step 0 reported `SKIP_REVIEW: true`.

> [!IMPORTANT]
> **Commit working-tree changes first**: If there are code, test, or config changes in the
> working tree, commit them separately with a truthful conventional commit message
> (`feat(...)`, `fix(...)`, etc.) before running Step 4. Handoff stages and commits **only
> the files it wrote** (`CONTEXT.md`, `HANDOFF_PROMPT.md`, `PLAN.md`).

**Step 3 — Reconcile PLAN.md**

Pass this session's completed TodoWrite titles to the script instead of hand-editing:
```bash
node tools/handoff.js --completed="title one|title two"
```
It flips each matching `- [ ]` line to `- [x]` by substring match and prints any titles
that matched nothing (`UNMATCHED`) — hand-edit only those, and add wholly new lines
under the relevant section by hand if this session added scope `PLAN.md` doesn't have yet.
Skip if Step 0 reported `NOOP: true`.

**Step 4 — Handoff**
```bash
node tools/handoff.js
```
Reads state from git and `PLAN.md`, writes `CONTEXT.md` and `HANDOFF_PROMPT.md`, copies
the resume prompt to clipboard, stages and commits **only the files it wrote**, and pushes
to remote origin. Any remaining uncommitted files in the working tree are reported rather
than buried.

**Step 5 — Prune branches** (report-only)
```bash
node tools/prune-branches.js
```
Reports merged worktrees/branches left over from finished sessions and whether local
`master` is behind `origin/master`. This step only reports — mention any findings in the
handoff summary; don't run `--apply` here even if it finds candidates. See
`/prune-branches` for the interactive cleanup flow.

**Variants:**
- `node tools/handoff.js --read-only` — preview without writing or committing.
- `node tools/handoff.js --preflight` — report working tree status.
