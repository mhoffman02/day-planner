# v_ parameter validation library: review (2026-10-30)

This is a Chief Architect and SW-QA review of the draft (`~/.claude/jobs/3b554013/tmp/v_-draft.js`). It has been
rebuilt as [`src/integration/v_.js`](../src/integration/v_.js), which the build bundles into `DPEngines.v_` in
`gas-app/Engines.gs`.

Tests:

- [`tests/v_.test.js`](../tests/v_.test.js): 51 unit tests, with 100% line, branch and function coverage.
- [`tests/v_.adversarial.test.js`](../tests/v_.adversarial.test.js): 21 security and sanitizer tests.
- [`tests/v_.boundary.test.js`](../tests/v_.boundary.test.js): 6 E2E tests against real exported functions.

## Findings (ranked)

The "Test" column names the test that went red against the draft and is green now.

| # | Sev | Finding | Changed | Test |
|---|-----|---------|---------|------|
| 1 | BLOCKER | `ParamBuilder` has no `done()`, so the documented `v_.guard(arguments,...).param(...)...done()` throws a TypeError. | ParamBuilder forwards `done/implement/compile/returns`. `guard().done()` returns the sanitized args array. | F1 |
| 2 | BLOCKER | Messages embed the value through `JSON.stringify`. This leaks secrets and PII, gives a 1,000,050-char message for a 1e6 string, and echoes `<script>` raw. | Values are never echoed. `describe()` prints only type, length or number (`string (length 27)`). Caller key names show only when they are short identifiers, otherwise `[unnamed key]`. | F4, A10, A19, A20 |
| 3 | BLOCKER | A builder still mutates after `implement()`. The compiled validator shares the spec objects, so `b.optional()` later silently relaxes a live function. Duplicate param names are also accepted. | `implement/compile/done` seal the builder. Closed params reject further rules, and duplicate names are misuse. | F6 |
| 4 | BLOCKER | `pretty()` has a bare `catch {}`, which the repo bans. Its `String(value)` fallback lets a hostile `toString` throw a non-ValidationError out of the validator. | `pretty` is gone. The only catch, `runChecked`, rethrows misuse and ValidationError. Anything else is logged with `console.error(context, err.stack)` and fails closed as rule `unreadable`. | A4, A7 |
| 5 | HIGH | `nullable()` still runs the type check and rules on null (`expected string, received null null`). | null plus nullable returns before the type check and rules. | F7 |
| 6 | HIGH | Numeric rules coerce: `"5" > 0` passes, and so does an object whose `valueOf` lies. Bounds can be strings or NaN. | Rules test `typeof v === 'number'`. Bounds must be finite. A rule that conflicts with the declared type (`string().gt(0)`) is misuse at compile. | F8, A8 |
| 7 | HIGH | `email()` regex is O(n^2): 485 ms on 40k chars in the red run. | Rewritten with linear dot-separated segments, plus the 254-char RFC cap. `uuid()` is fixed width. The coercion regexes are linear and capped at 64 chars. | A12, A13 |
| 8 | HIGH | `matches()` with a `g` or `y` regex is stateful through `lastIndex`, so results alternate. | The regex is cloned without `g`/`y` at definition. | F13 |
| 9 | HIGH | No structural types. `arrayOf(name, fn)` passes `(el, i, arr)` to the predicate and reports no index. There is no shape, union, date or enum. | Added `shape` (strict by default, `.loose()`), `arrayOf(schema)`, `union`/`oneOfTypes`, `date`, `enumOf(frozen)` and `instanceOf`. Errors carry a path such as `opts.items[1].due`. | shape, arrayOf, union, enumOf tests |
| 10 | HIGH | Errors have only a message. Callers cannot branch on them. | `ValidationError {name, message, fnName, param, rule, path}`. Misuse is a separate `TypeError` (`v_ misuse: ...`), so a catch for user errors never swallows a programmer bug. | ValidationError shape |
| 11 | HIGH | TOCTOU: the validated object is passed through by reference. A getter or Proxy can return a checked value and then a different one. | `shape` and `arrayOf` read each property once and pass a fresh copy. Proxies are copied out, and revoked or throwing Proxies fail closed. | A5, A6 |
| 12 | HIGH | Prototype pollution: no handling of `__proto__`, `constructor` or `prototype` keys. | Reserved keys are rejected in caller data (`unsafeKey`, even in loose shapes) and are misuse in a spec. Output objects get a normal prototype. | A1-A3, E4 |
| 13 | HIGH | Forgetting `done()` on a guard means nothing validates the last param, silently. | The next `guard()` call throws `guard for X never called done()`. | F18 |
| 14 | HIGH | `type()` twice silently overrides the first type. | Misuse: `type already set to string`. | F5 |
| 15 | MED | `object()` accepts Date, Map, class instances and `new String`. | It is now a plain object (prototype null or Object.prototype, any realm). | F15, A15 |
| 16 | MED | `length` counts UTF-16 units, so an emoji counts as 2. | It counts code points. | F9 |
| 17 | MED | `oneOf` renders NaN as `null` (from JSON.stringify). `oneOf([...])` never matches, silently. | NaN shows as `NaN`. An array argument or an empty list is misuse. | F10 |
| 18 | MED | `fn.length` is not checked against the number of params. | `implement()` rejects a function that declares more params than the spec. Default params are fine. | F11 |
| 19 | MED | `between(9, 1)` and `length(3, 2)` silently always fail. | Misuse: `min 9 > max 1`. | F8, length test |
| 20 | MED | `uuid()` rejects v6, v7 and v8. | Accepts `[1-8]`. | F14 |
| 21 | MED | `satisfies()` passes on any truthy return (for example an error string). | The predicate must return a boolean, otherwise misuse. | F16 |
| 22 | MED | `integer()` accepts unsafe integers (`2**53`). | Uses `Number.isSafeInteger`. | types test |
| 23 | MED | `guard()` recompiles on every call. | See "Deliberately not changed" below. There is no compile step now (each param is checked as its chain closes), and `fn().compile()` gives the compile-once form. | F2, benchmark |
| 24 | MED | `instanceOf(undefined)` fails at call time with a raw TypeError. | Misuse at definition. | types test |
| 25 | LOW | `new` on an implemented class fails, because `fn.apply` cannot call a class. | `Reflect.construct` when `new.target` is set. | F17 |
| 26 | LOW | `v_.fn()` with no name reports `anonymous` even when the function has a name. | Falls back to `fn.name`. | F17 |
| 27 | LOW | Cross-realm Dates (vm or iframe) fail `instanceof`. | Brand check through `Date.prototype.getTime.call`. A spoofed `Symbol.toStringTag` is unreadable. | A9, A16, edges |
| 28 | LOW | `Array.from(arguments)` allocates on every call, and the module is not ESM. | `implement` sanitizes into its own rest array. Named ESM exports `v_` and `ValidationError` are bundled into `DPEngines`. | runtime tests |

## Deliberately not changed (and why)

- **`guard()` still runs the builder chain on each call.** The chain is the caller's own code, so it runs on every
  invocation. Caching it by name would be wrong when two functions share a name or a chain branches. What changed:
  there is no compile step, each param is checked as soon as its chain closes, and `fn().implement()` or
  `fn().compile()` compile once. Measured over 1e6 calls with 2 params: raw 3 ns, `implement` 69 ns, `guard` 510 ns.
  Use `implement` on hot paths.
- **A forgotten `done()` on the very last guard in a run** is only caught by the next `guard()` call. JavaScript has no
  hook that fires at the end of a statement.
- **`matches(userRegex)` cannot be made ReDoS-safe.** Only the built-in regexes are. For untrusted input, put
  `maxLength()` before `matches()`; length rules run before the other rules.
- **`object()` (with no `shape`) passes the reference through.** Copying only happens for `shape` and `arrayOf`.
  Declare a shape when TOCTOU matters.
- **Code points, not graphemes.** `Intl.Segmenter` is not dependable on GAS V8.
- **No recursive or lazy schemas.** Traversal depth is bounded by the schema, so a 1e5-deep payload costs O(schema).
- **`default()` objects are checked for a shallow freeze only.** A deep-freeze walk needs cycle handling, which is not
  worth it for constant defaults.
- **Strict arity is kept by default.** It is fail-fast, as in Writing Solid Code. The trade-off is that a wrapped
  function passed straight to `Array.prototype.map` fails, because map passes 3 args. Use `.allowExtraArgs()` there.
- **Production engines are not edited.** The E2E harness wraps them in tests only. Two finds for later:
  `planWaiting` throws `JSON.stringify(nagDate)` into its error (it echoes the value; see test E4). It also crashes
  with `now.toISOString is not a function` on a JSON payload (test E3). A `v_` boundary fixes both.

## Design: sanitizing, docs and return contracts

- **Sanitizers are opt-in and explicit.** They run in a fixed order: `default` (only when undefined), then `trim`
  (strings only), then the coercion (`toNumber`, `toInteger`, `toDate`). After that come the type check, the length
  rules, the nested shape/array/union checks, and finally the remaining rules. Nothing is coerced implicitly:
  - `toNumber` takes decimal strings only, so `0x10`, `''` and `' 5'` (without `trim`) are rejected.
  - `toDate` reads `YYYY-MM-DD` as local midnight through `new Date(y, m-1, d)`, which follows the repo date rule. It
    also accepts ISO date-times and epoch ms, and copies a Date it is given.
  - A failed coercion leaves the original value in place, so the type check reports it (`expected finite number
    (after toNumber), received string (length 3)`).
  - A `default()` must pass its own schema (checked at compile) and must be a primitive or frozen.
  - The idempotence property `sanitize(sanitize(x)) == sanitize(x)` holds over 500 fast-check runs (test A21).
- **The caller's args are never mutated.** `implement()` sanitizes its own rest array and passes it to the function.
  `guard().done()` and `compile()(args)` return a new array, and `shape`/`arrayOf` return new objects.
- **The chain doubles as the JSDoc block.** `param(name, doc)` or `.doc(text)` on a schema adds the text. The wrapper
  carries a frozen `fn.spec` (`name`, `params[{name, doc, type, optional, nullable, hasDefault, defaultValue,
  rules}]`, `returns`). `v_.describe(fn)` prints a JSDoc block that includes nested `@param opts.field` lines and
  `[name=default]`, so a tool can generate docs from the contract that is actually enforced.
- **Return contracts are documented and test-asserted, not enforced by default.** `.returns(schema, doc)` stores the
  contract on the wrapper. Runtime checks are skipped because our own code produces the value and the tests are the
  place to prove it. `v_.checkReturn(fn, value)` lets a unit test assert against the same schema, and
  `v_.assertShape(schema, value)` does the same for any value. That gives one contract for the docs, the runtime and
  the tests. `.enforceReturns()` turns runtime checking on for trust boundaries, such as an RPC result crossing
  `google.script.run`, and awaits promises. A return schema may not sanitize; that is misuse, because a contract
  that rewrites the value would hide a bug.

## Red run

Each red run was taken with the draft installed verbatim as `src/integration/v_.js`, with `export` added. Every
test listed below failed before the rewrite.

- `node --test tests/v_.test.js`: tests 45, pass 0, fail 45. Representative lines:
  - `✖ F1 guard chain ends with ParamBuilder.done() ...` with `TypeError: v_.guard(...)...lte(...).done is not a function`
  - `✖ F4 error messages never echo ...` with `AssertionError: login(token): expected integer, received string "ghp_SECRET_TOKEN_1234567890".`
  - `✖ F5 setting a type twice is a definition-time misuse` with `Missing expected exception.`
  - `✖ F6 duplicate param names and builder use after implement() are misuse` with `Missing expected exception.`
  - `✖ F7 nullable null skips type and rules` with `ValidationError: f(a): expected string, received null null.`
  - `✖ F10 oneOf reports NaN as NaN and rejects misuse` with `The validation function is expected to return "true". Received false` (message said `null`)
  - `✖ F11 implement() rejects a function with more params than the spec` with `Missing expected exception.`
  - `✖ F17 implement() without a name uses the function name ...` with `Expected values to be strictly equal` (got `anonymous`)
  - `✖ F18 forgetting done() on a guard is reported ...` with `Missing expected exception.`
  - The remaining 36 tests failed with `TypeError: v_.<x> is not a function` (`string`, `shape`, `toNumber`, `trim`,
    `compile`, ...). These capabilities were missing from the draft.
- `node --test tests/v_.adversarial.test.js`: tests 21, pass 0, fail 21. Representative lines:
  - `✖ A7 objects whose toString, valueOf or toJSON throw ...`: the result was not a ValidationError (the hostile `toString` escaped)
  - `✖ A8 a valueOf that lies is never used for numeric rules` with `Missing expected exception.`
  - `✖ A10 a 1e6-char string ...` with `AssertionError: message length 1000050`
  - `✖ A12 email() and uuid() are ReDoS-safe ...` with `AssertionError: 484.872299 ms on input length 40003`
  - `✖ A14 NaN, Infinity and -0`, `✖ A15 boxed primitives ...` with `Missing expected exception (isVE).`, `✖ A17`, `✖ A18`, `✖ A19`, `✖ A20`: wrong behavior
  - A1-A3, A5, A6, A11, A13, A16 and A21 failed with `TypeError: v_.<x> is not a function` (no shape, date or coercion).
- `node --test tests/v_.boundary.test.js`: `✖ tests/v_.boundary.test.js 'test failed'`. The harness fails at import
  because `v_.shape is not a function`.
- After the rewrite, `runtime: the source is safe to paste into gas-app/Script.html` went red on the new module
  (`line 2: // inside a comment`, from an example line). The comment was rephrased and the test is green.

## Green evidence (2026-10-30)

- `node --test --experimental-test-coverage --test-coverage-include=src/integration/v_.js tests/v_.test.js`:
  tests 51, pass 51, and `v_.js | 100.00 | 100.00 | 100.00`.
- Adversarial suite: 21 of 21 pass. Boundary suite: 6 of 6 pass. `npm test`: tests 1395, pass 1395, fail 0.
- `npm run lint`: exit 0. `npm run test:coverage` passes its ratchet.

## Open decisions

1. Which way should `shape()` default?
   - **A (recommended):** strict, so unknown keys are rejected. This catches typos in option bags. Use `.loose()`
     for Google API resources.
   - **B:** loose.
2. What should `length()` count?
   - **A (recommended):** code points, which is what a person sees.
   - **B:** UTF-16 units, which match the Sheets and Docs storage limits. This would add `utf16Length()`.
3. `guard()` style:
   - **A (recommended):** keep it, but prefer `fn().implement()` at module boundaries (7x cheaper per call).
   - **B:** deprecate `guard()`.
