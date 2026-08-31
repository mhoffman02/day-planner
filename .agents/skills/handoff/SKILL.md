---
name: handoff
description: Generate end-of-session handoff — preflights the diff to skip unnecessary work, runs tests, reviews uncommitted changes, reconciles PLAN.md, writes CONTEXT.md, commits, and pushes.
tags: [handoff, session, context, plan, day-planner]
version: 3.0.0
---

# Day Planner Handoff Skill — End-of-Session Wrap-Up

The authoritative step list lives in `.agents/commands/handoff.md` (mirrored to
`.claude/commands/handoff.md` / `.kilo/workflows/handoff.md`) — follow it directly. Summary:

1. **Step 0 — Preflight** (`node tools/handoff.js --preflight`): reports `NOOP`/`SKIP_REVIEW` so
   a no-op or docs-only session skips Steps 1–2 entirely instead of spending tokens on a full
   test/review pass.
2. **Step 1 — Tests** (`npm test`): fix failures before proceeding.
3. **Step 2 — Code review**: `/code-review` at `low`/`medium` effort against the current diff —
   a safety-net pass, not a from-scratch audit. Skipped when Step 0 reports `SKIP_REVIEW: true`.
4. **Step 3 — Reconcile PLAN.md** (`node tools/handoff.js --completed="title one|title two"`):
   scripted substring match flips matching `- [ ]` lines to `- [x]`; hand-edit only what it
   reports as `UNMATCHED`.
5. **Step 4 — Handoff** (`node tools/handoff.js`): reads git + `PLAN.md` state, writes
   `CONTEXT.md`, stages changes, auto-fixes what it can (`eslint --fix`, missing `@file` JSDoc
   headers), commits, and pushes. The pre-commit hook (`.githooks/pre-commit`) re-runs `eslint`
   (no `--fix`) and the unit test suite as the hard gate on whatever auto-fix couldn't resolve.

**Variant:** `node tools/handoff.js --read-only` previews without writing or committing.

This file intentionally doesn't restate the exact commands/output shape — that duplication is
what went stale last time. Read `.agents/commands/handoff.md` for those.
