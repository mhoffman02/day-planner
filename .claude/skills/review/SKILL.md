---
name: review
description: Review day-planner uncommitted changes or named files - runs the generic review-uncommitted steps plus this repo's lint, ESM, OAuth-scope, date and link checks. Use before committing or when asked to review changes.
tags: [review, code-review, quality, esm, day-planner]
version: 3.0.0
---

# Day Planner review

Follow the user-level `review-uncommitted` skill (scope, mechanical pass, semantic pass, BLOCKER/HIGH/MEDIUM/LOW
report). This file adds only what is specific to this repo. Agy has no user skill: the same steps are scope =
`git status`/`git diff`/`git diff --staged` (never the full tree unless asked), mechanical pass below, then a
correctness/safety/test-coverage read of the diff.

## Mechanical pass (run directly)

```bash
node tools/check-esm-imports.js   # relative imports carry .js
npm run lint                      # ESLint, safe-char, catch-logging, Engines.gs build check
npm test
```

New or edited `.js` files carry a JSDoc `@file` header.

## Semantic pass: also check

- `drive.file` stays the only Drive scope; no `documents` scope, no `DocumentApp` (CLAUDE.md gotchas 2 and 6).
- No `.toISOString()` on local dates.
- Dynamic HTML escaped; external links carry `target="_blank"` + `rel="noopener noreferrer"`.
- Catches follow [fail-loud-catch](../../rules/fail-loud-catch.md); `gas-app/` follows the `gas-*` rules.

## Who reviews

- **Claude**: small, local diff → review inline. Non-trivial or OAuth/security → spawn the `deep` agent
  (opus/high, read-only prompt); a `lite` agent can first gather a digest of changed code and call sites.
- **Agy**: `invoke_subagent(Model="pro", Role="Security Reviewer", Prompt="...")` for a first pass; a deep
  pre-merge audit goes to `/consult-claude` ([[cross-cli-headless-invocation]]).
