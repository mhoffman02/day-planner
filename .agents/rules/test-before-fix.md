# Reproduce Before You Fix — Red Test First

- Applies to every behavior change, features included, in `src/*.js`, `gas-app/*` and `tools/*`: write the test, run
  it and see it fail for the stated reason, then implement and see it pass. Name the red run in the commit body as
  `Red-run: <test> <failure line>`; a `fix` also carries `Escaped-because:` (why no check caught it) and
  `Guard-added:` (the check that now does). `.githooks/commit-msg` (`tools/check-commit-msg.js`) blocks
  fix/feat/perf commits touching code without them. No red run seen → do not commit.
- A unit test cannot see what HtmlService serves. A gas-app change is not done until `npm run deploy:home` passes
  (live `/dev` load over CDP); a check that cannot run (e.g. Chrome not signed in) blocks the deploy, it is not
  skipped. On 2026-10-30 @337-@340 passed 1288 tests and never loaded; the user found it.

- When fixing a bug in `src/*.js`: MUST add/extend a case in the matching `tests/*.test.js` asserting the correct behavior, and run it (`node --test tests/<file>.test.js`) to confirm it fails, before touching the implementation.
- MUST confirm the failure reason matches your diagnosis — a test that fails for the wrong reason doesn't count.
- Then fix, confirm that test goes green, then run the full `npm test`.
- Applies to bug fixes in `src/*.js` only. Does not apply to pure refactors or new features with no prior broken behavior.
- Skip only when a case is genuinely impractical to express as a unit test (live-only or browser-only failure) — MUST fall back to `tools/smoke-test.js` (mock mode) or `npm run deploy:home -- --check` (live HOME `/dev`) to confirm repro instead, and say explicitly that this substitution was made.

**Why:** without a red test first, "fixed" can mean "stopped erroring on the one input I tried by hand." A red→green cycle confirms the diagnosis and leaves a permanent regression test.
