# Zero Flaky Tests

A test that passes and fails on the same code is a bug in the test or the code. Fix it or delete it the same day.

- Never retry, rerun or skip it: no `retry`/`retries` count, no `.skip`/`.todo` or `{ skip }`/`{ todo }`, no `--test-rerun-failures`, no `continue-on-error` or retry action in CI.
- Usual causes: real clock or time zone (pin the clock, see `tests/dstClock.test.js`), shared module state between tests, unawaited promises, timers, test order.
- Deleting is allowed only with the reason in the commit body; a deleted test that covered a behavior gets a replacement.

Enforced: `tools/check-flaky-tests.js` in `npm run lint` (pre-commit and CI). CI runs the suite four times (coverage, then Chicago, UTC, Auckland), so a flake shows up red.
**Why:** A17.9 (2026-11-15): a retried flake hides a real race, and every hidden one makes the next red run easier to ignore.
