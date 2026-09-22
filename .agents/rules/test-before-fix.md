# Reproduce Before You Fix — Red Test First

- When fixing a bug in `src/*.js`: MUST add/extend a case in the matching `tests/*.test.js` asserting the correct behavior, and run it (`node --test tests/<file>.test.js`) to confirm it fails, before touching the implementation.
- MUST confirm the failure reason matches your diagnosis — a test that fails for the wrong reason doesn't count.
- Then fix, confirm that test goes green, then run the full `npm test`.
- Applies to bug fixes in `src/*.js` only. Does not apply to pure refactors or new features with no prior broken behavior.
- Skip only when a case is genuinely impractical to express as a unit test (live-only or browser-only failure) — MUST fall back to `tools/e2e/smoke-test.js` to confirm repro instead, and say explicitly that this substitution was made.

**Why:** without a red test first, "fixed" can mean "stopped erroring on the one input I tried by hand." A red→green cycle confirms the diagnosis and leaves a permanent regression test.
