# Solid Code: Every Practice Has a Gate

Maguire (*Writing Solid Code*) and Knuth practices, kept only where a check enforces them. A practice with no
check is a wish; add the check or drop the line.

| Practice | Enforced by |
| :--- | :--- |
| Red test before every behavior change; name it | `.githooks/commit-msg` (`tools/check-commit-msg.js`): `Red-run:` on fix/feat/perf touching code |
| Never walk away from a bug: why it escaped, what now catches it | same hook: `Escaped-because:` + `Guard-added:` on every `fix` |
| Fail loud, never fail open | `tools/check-catch-logging.js` in `npm run lint` ([[fail-loud-catch]]) |
| Validate at module boundaries, not internals | `v_` in `src/integration/v_.js` ([ADR 0005](../../docs/adr/0005-js-with-v-validation-not-typescript.md)); return specs asserted in unit tests |
| Coverage never drops; no untested src file | `npm run test:coverage` (`coverage-baseline.json`), CI |
| Edge cases by law, not by example | property tests in `tests/properties.test.js` (fast-check) |
| Tests must notice wrong results, not just run lines | `npm run test:mutation` (Stryker) before big phases; survivors become tests |
| Valid, accessible HTML | `tools/check-html.js` in lint (`html-baseline.json`, counts only go down) |
| What the user loads is what was tested | `npm run deploy:home` live `/dev` gate ([ADR 0006](../../docs/adr/0006-live-deploy-gate.md)) |
| No local skip of the gates | `.github/workflows/ci.yml` runs sync check, lint, coverage on every push |
| Comments say why; decisions are recorded | `review` skill semantic pass; `docs/adr/` |
| Measure before optimizing | no check; cite a timing in the commit body for any perf change |

- MUST NOT commit with `--no-verify` unless a failing check is outside the commit (e.g. another agent's untracked
  files). Then run `tools/check-commit-msg.js` by hand and watch CI on that commit before moving on.
- A ratchet baseline (`coverage-baseline.json`, `html-baseline.json`) only tightens, via `--update` after a real
  improvement. Never hand-edit it looser to pass.

**Why:** on 2026-10-30, @337-@340 passed 1288 tests and never loaded. The user asked for Maguire/Knuth practice
"in our workflow". Prose rules had not stopped it; checks do.
