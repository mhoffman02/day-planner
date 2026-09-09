# GAS Cross-File Global Init Order

All `.gs` files in an Apps Script project execute as if concatenated into one script, sharing
one global scope. Function declarations are hoisted, so calling a function from another file is
always safe regardless of file order. Top-level `var`/`let`/`const` *initializers* are not
hoisted the same way, and Google does not officially document the cross-file load order — but
`clasp push` (how this project deploys) verifiably executes files in plain alphabetical-by-filename
order, overriding any manual reorder done in the Apps Script editor's own file-list UI (confirmed:
[clasp#72](https://github.com/google/clasp/issues/72),
[Apps Script community thread](https://groups.google.com/g/google-apps-script-community/c/wqIdm0Cfj0g)).
So a top-level initializer that calls a function/service defined in a file that sorts later can
silently read `undefined` instead of erroring.

- MUST NOT write a top-level `var`/`let`/`const` in `gas-app/*.gs` whose initializer is anything
  other than a literal (string/number/boolean/regex, or an array/object built only from literals).
- MUST initialize anything that needs a function call, a service handle (`CacheService...`,
  `PropertiesService...`), or another global's value lazily — inside a function, computed on
  first call (memoize in a module-local variable if reuse matters) — never as a top-level
  initializer.
- MUST NOT "fix" ordering by renaming a file to sort first (e.g. `_globals.gs`, `0_Globals.gs`).
  That only relocates the hazard onto a naming convention that the next added file can silently
  violate (`0Aardvark.gs` sorts *before* `0_Globals.gs` — `A` < `_` in ASCII). The hoisted-function
  approach above has no file-order dependency at all, so prefer it outright rather than trying to
  win the alphabet.
- Enforced by `node tools/check-gas-global-init-order.js` (`npm run lint`, pre-commit).

Current safe examples in `gas-app/Code.gs`: `DAY_PLANNER_FAVICON_URL`, `APP_VERSION`,
`TASK_STATUS_MARKER_RE`, `TASK_EXTRA_STATUSES`, `TASK_META_MARKER_RE` — all literals, no
cross-file load-order dependency. See [[single-source-of-truth-constants]] for the related (but
distinct) rule about not hand-duplicating the *value* of a shared constant across files.

**Why:** a load-order-dependent top-level global would fail intermittently/silently rather than
at a predictable point, and Apps Script gives no API to pin file load order the way ES module
imports do.
