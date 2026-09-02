# Reproduce Before You Fix — Red Test First for Bug Fixes

## The rule

When fixing a reported bug in `src/*.js`, first add or extend a case in the
matching `tests/*.test.js` that asserts the *correct* behavior, and run it
(`node --test tests/<file>.test.js`) to confirm it actually fails, for the
reason you think it does, before touching the implementation. Then make the
fix and confirm that same test goes green, followed by the full `npm test`.

This is not new infrastructure — it's an ordering discipline layered on the
test setup and `npm test` gate this repo already has (see `CLAUDE.md`
Commands).

## Why

Without a red test first, "fixed" can mean nothing more than "stopped
erroring for the one input I tried by hand" — the diagnosis was never
actually confirmed. Requiring the test to fail first, for the expected
reason, makes "reproduced" concrete instead of assumed, and it leaves a
permanent regression test behind so the same bug can't silently come back.

## How to apply

- Applies to bug fixes in `src/*.js` (the tested, canonical logic layer).
  Doesn't apply to pure refactors, new features with no prior broken
  behavior, or `gas-app/`-only hand-duplicated code with no `tests/`
  coverage (see `[[sync-src-and-gas-app]]`) — there's no test file to red/green
  there.
- Skip it only when a case is genuinely impractical to express as a unit
  test (e.g. a live-GAS-only or browser-only failure) — fall back to the
  live-browser driver (`tools/e2e/smoke-test.js`) to confirm repro instead,
  and say so explicitly rather than skipping verification silently.
