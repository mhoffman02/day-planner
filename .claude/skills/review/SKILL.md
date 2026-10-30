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
- No `.toISOString()` on local dates (`.slice/.split/.substring` on it is an ESLint error; a bare one used as a day key is not caught).
- Dynamic HTML escaped; external links carry `target="_blank"` + `rel="noopener noreferrer"`.
- Catches follow [fail-loud-catch](../../rules/fail-loud-catch.md); `gas-app/` follows the `gas-*` rules.
- Comments say *why* (constraint, incident, rejected alternative), not *what* the next line does. A comment
  that restates the code: flag it. A non-obvious branch, magic value or workaround with no why: flag it.
- A change that reverses or bends a decision in `docs/adr/` either cites the ADR or adds a superseding one.

Solid Code 2.0 review-only items (no check can see them; Chief Arch ROI 2026-10-30):

- Lifecycle comes from the item's own fields (dueDate, taskSource), never from the list that delivered it (2b2d712).
- A multi-step write compensates step 1 when step 2 fails and tells the user; a test injects that failure. A
  stale-tab write carries a mode/version token (MODE_CHANGED) and fails closed (2f28e80, 3026c11).
- An external-API loop has a page cap and a time budget, and stops at the first quota error (GAS throws on
  quota; stop and cool down, do not retry-loop; 6077c04).
- A new setting, UX path or behavior change missing from TODO.md/PLAN.md, built without asking the user: BLOCKER.
- New collection logic is tested at 0, 1, duplicate id and max size; live tests delete what they create (90374e5).
- New exported functions take no boolean mode flag; click handlers sit only on `<button>`/`<a>`.
- A value shared across files or runtimes has one definition ([single-source-of-truth-constants](../../rules/single-source-of-truth-constants.md)).

## Who reviews

- **Claude**: small, local diff → review inline. Non-trivial or OAuth/security → spawn the `deep` agent
  (opus/high, read-only prompt); a `lite` agent can first gather a digest of changed code and call sites.
- **Agy**: `invoke_subagent(Model="pro", Role="Security Reviewer", Prompt="...")` for a first pass; a deep
  pre-merge audit goes to `/consult-claude` ([[cross-cli-headless-invocation]]).
