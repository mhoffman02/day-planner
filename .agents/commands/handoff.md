---
description: Generate end-of-session handoff — runs tests, reviews uncommitted changes, updates PLAN.md status, writes CONTEXT.md, commits
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

**Step 1 — Tests**
```bash
npm test
```
Fix any failures before proceeding. Skip if Step 0 reported `NOOP: true`.

**Step 2 — Code review** (uncommitted changes)

Use `/code-review` at `low` or `medium` effort against the current diff and address any
blocking findings before committing. This is a safety-net pass over changes that (mostly)
already had in-session review, not a from-scratch audit — don't default to `high`/`xhigh`
effort here. Skip entirely when Step 0 reported `SKIP_REVIEW: true`.

**Step 3 — Reconcile PLAN.md**

Pass this session's completed TodoWrite titles to the script instead of hand-editing:
```bash
node tools/handoff.js --completed="title one|title two"
```
It flips each matching `- [ ]` line to `- [x]` by substring match and prints any titles
that matched nothing (`UNMATCHED`) — hand-edit only those, and add wholly new lines
under the relevant phase by hand if this session added scope `PLAN.md` doesn't have yet.
Skip if Step 0 reported `NOOP: true`.

**Step 4 — Handoff**
```bash
node tools/handoff.js
```
Reads state from git and `PLAN.md`, writes `CONTEXT.md` with a resume summary, stages
changes, auto-fixes what it can (`eslint --fix`, missing `@file` JSDoc headers), commits,
and pushes. The pre-commit hook re-runs `eslint` (no `--fix`) as the hard gate on
whatever auto-fix couldn't resolve, alongside the unit test suite.

**Variant:** `node tools/handoff.js --read-only` — preview without writing or committing.
