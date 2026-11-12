# Red Test First

Every behavior change (feature or fix) in `src/*.js`, `gas-app/*`, `tools/*`: write the test, run it, see it fail for the diagnosed reason, then implement and see it green, then full `npm test`. A test failing for the wrong reason doesn't count. No red run seen: do not commit.

- Fix in `src/*.js`: extend the matching `tests/*.test.js`; `node --test tests/<file>.test.js`.
- Commit body (`.githooks/commit-msg`, `tools/check-commit-msg.js` blocks fix/feat/perf touching code): `Red-run: <test> <failure line>`; a `fix` also `Escaped-because:` and `Guard-added:`.
- Skip only if a unit test is impractical (live/browser-only): use `tools/smoke-test.js` (mock) or `npm run deploy:home -- --check` (live HOME `/dev`), and say so.
- Not for pure refactors.
- Unit tests can't see what HtmlService serves. A `gas-app` change isn't done until `npm run deploy:home` passes (live `/dev` load over CDP). A check that can't run (Chrome not signed in) blocks the deploy; never skip it.

**Why:** "fixed" otherwise means "stopped erroring on the one input I tried". On 2026-10-30 @337-@340 passed 1288 tests and never loaded.
