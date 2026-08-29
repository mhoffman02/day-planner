# Keep gas-app/Script.html in Sync with src/ — Never Edit One Without the Other

## The rule

Google Apps Script's `HtmlService` cannot `import` ES modules, so the core logic in
`src/taskEngine.js` and `src/gasBridge.js` (`GASBridge`, `parseTaskTitle`,
`formatTaskTitle`, `getNextStatus`, etc.) is hand-duplicated inline near the top of
`gas-app/Script.html`. There is no build step and no automated sync between the two —
`npm test` only exercises `src/`, never the GAS-side copy.

**Any change to shared logic in `src/taskEngine.js`, `src/gasBridge.js`, or another
`src/*.js` engine whose behavior is also duplicated in `gas-app/Script.html` must be
ported into `gas-app/Script.html` in the same change.** Server-side equivalents (the
`gasTaskId` tagging/sync logic) live in `gas-app/Code.gs` and must stay consistent with
`src/syncEngine.js`'s model of the same relationship.

## Why

If only `src/` is updated, `npm test` stays green while production (`gas-app/`) silently
keeps the old behavior — the test suite gives false confidence because it never touches
the file that actually ships to the GAS web app.

## Required pattern

1. Change the logic in `src/*.js`, update/add its test in `tests/*.test.js`, run `npm test`.
2. Grep `gas-app/Script.html` (and `gas-app/Code.gs` for server-side logic) for the
   duplicated function/class and port the same change by hand.
3. Smoke-test via `node server.js` (http://localhost:3000) — it injects the real
   `src/gasBridge.js`, so this won't catch a `Script.html`-only staleness, but it does
   confirm the intended behavior still holds across both copies.

## Enforcement

Before committing a change to any `src/*.js` engine that has an inline counterpart in
`gas-app/Script.html` or `gas-app/Code.gs`, check whether that counterpart still matches.
A change to `src/taskEngine.js` without a corresponding `gas-app/Script.html` diff (when
the change affects duplicated logic) should be treated as incomplete.
