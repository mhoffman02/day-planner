---
name: tdd
description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.
tags: [tdd, testing, red-green-refactor]
version: 1.0.0
source: adapted from mattpocock/skills (2026-09-25 ADOPT decision, .kilocode/TODO.md / DECISIONS.md)
---

# Test-Driven Development

- Use Node.js built-in `node:test` (`describe`, `it`, `assert.strictEqual`, `assert.deepStrictEqual`) in `tools/__tests__/*.test.js`.
- Never use Jest or Vitest.
- Consult [tests.md](tests.md) for test specifications and [mocking.md](mocking.md) for mocking rules.

## Test Boundaries and Seams

- Test exclusively through public interfaces (seams); never test private helpers or internal implementation details.
- Record all seams under test before authoring tests.
- Target established seams in exported pure functions in `tools/generate-*.js` (`isExcludedFeature`, `selectFeatureEntries`, `abstractFieldValue`, `buildStepItems`) and `tools/harvest.js` (`parseAnnotation`, `attachComments`, `categorizeTags`, `extractFieldValue`).
- Export all new logic as pure functions to expose test seams; never leave logic inline in `main()`.

## Anti-Patterns

- Never couple tests to implementation details: do not mock internal collaborators, do not test private helpers, and do not assert via secondary parsing.
- Never write tautological assertions; assert strictly against independent known-good literals or real corpus fixtures.
- Never slice horizontally by authoring all tests before implementation.

## Red-Green Loop Rules

1. **Red**: Write a single failing test at a pre-agreed seam. Run `npm test` to verify failure.
2. **Green**: Write the minimal code required to pass the failing test. Never add speculative code or anticipate future tests.
3. **Iterate**: Execute one vertical slice per cycle (one seam, one test, one minimal implementation).
4. Do not refactor during the red-green loop; defer refactoring to the `review` skill.
