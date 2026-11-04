# Solid Code: Every Practice Has a Gate

Maguire (*Writing Solid Code*) and Knuth practices, kept only where a check enforces them. A practice with no
check is a wish; add the check or drop the line.

| Practice | Enforced by |
| :--- | :--- |
| Red test before every behavior change; name it | `.githooks/commit-msg` (`tools/check-commit-msg.js`): `Red-run:` on fix/feat/perf touching code |
| Never walk away from a bug: why it escaped, what now catches it | same hook: `Escaped-because:` + `Guard-added:` on every `fix` |
| Fail loud, never fail open | `tools/check-catch-logging.js` in `npm run lint` ([[fail-loud-catch]]) |
| Validate at module boundaries, not internals | `v_` in `src/integration/v_.js` ([ADR 0005](../../docs/adr/0005-js-with-v-validation-not-typescript.md)); `tools/check-rpc-guards.js` in lint: every Code.gs RPC with params guards its args (`rpc-guard-baseline.json`, only shrinks) |
| Date keys are local, never UTC | ESLint `no-restricted-syntax` on `toISOString().slice/split/substring`, every `.js`/`.gs` and gas-app/*.html script |
| Mirrored code stays identical | `tools/check-mirror.js` in lint (`mirror-baseline.json`: src/*.js vs Script.html, styles.css vs Styles.html) |
| Served HTML never truncates | `tools/check-gas-script-html-safe-chars.js`: every script and style block of every gas-app/*.html |
| No GAS globals; no unbounded loops; no `substr`; no implicit coercion | ESLint: `Program > VariableDeclaration`, `global.X = <value>`, `while(true)`/`for(;;)`, `no-restricted-properties`, `no-implicit-coercion` |
| Strict mode in every JS/GS file | ESLint `strict`: `'global'` (`'use strict';` first statement) in every `.gs` and gas-app html script body; `'safe'` flags a redundant directive in ES modules. `Engines.gs` gets it from `tools/build-gas-engines.js` |
| Separation of concerns: no `style=`/`:style`, no `on*=` handlers, no inline `<style>`/`<script>` bodies in page shells | `tools/check-html.js` (`no-inline-style` + `soc/*` counts in `html-baseline.json`, only go down); CSS/JS ship as partials via `<?!= include() ?>` |
| `===`, `const`, no `var`/eval/param reassign | ESLint 2T rules on `.js`/`.gs`/gas-app html scripts; legacy `var` in gas-app grandfathered in `eslint-suppressions.json` (only shrinks). Projects started after 2026-11-01 get no suppressions |
| No pills; dynamic HTML only through sanitizers | `tools/check-html.js`: radius 50%/99px/≥100px fails; `x-html` only via `formatEventDescription`/`renderCardLine` |
| Coverage never drops; no untested src file | `npm run test:coverage` (`coverage-baseline.json`), CI |
| Edge cases by law, not by example | property tests in `tests/properties.test.js` (fast-check) |
| Tests must notice wrong results, not just run lines | `npm run test:mutation` (Stryker) before big phases; survivors become tests |
| CSS design tokens: `var(--token)`, no local magic colors/z-index/px font, no `!important`/`#id`, focus ring and reduced motion kept | `tools/check-css.js` in `npm run lint` (`css-baseline.json`, counts only go down; `tests/cssGate.test.js`) |
| Valid, accessible HTML | `tools/check-html.js` in lint (`html-baseline.json`, counts only go down); axe-core on the live /dev app in `npm run deploy:home` (`axe-baseline.json` per-rule counts only go down, new rule ids fail; `--update-axe` lowers) |
| What the user loads is what was tested | `npm run deploy:home` live `/dev` gate ([ADR 0006](../../docs/adr/0006-live-deploy-gate.md)) |
| No local skip of the gates | `.github/workflows/ci.yml` runs sync check, lint, coverage on every push |
| Comments say why; decisions are recorded | `review` skill semantic pass; `docs/adr/` |
| Measure before optimizing | commit-msg: `Measured:` line on every perf commit touching code |
| Review-only judgment (identity, compensated writes, API budgets, ask-before-design) | `review` skill "Solid Code 2.0 review-only items" |

- MUST NOT commit with `--no-verify` unless a failing check is outside the commit (e.g. another agent's untracked
  files). Then run `tools/check-commit-msg.js` by hand and watch CI on that commit before moving on.
- A ratchet baseline (`coverage-baseline.json`, `html-baseline.json`) only tightens, via `--update` after a real
  improvement. Never hand-edit it looser to pass.

**Why:** on 2026-10-30, @337-@340 passed 1288 tests and never loaded. The user asked for Maguire/Knuth practice
"in our workflow". Prose rules had not stopped it; checks do.
