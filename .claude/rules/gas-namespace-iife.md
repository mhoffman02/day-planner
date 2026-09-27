# GAS IIFE Namespace / Explicit Export Surface

All `.gs` files in `gas-app/` execute in one shared global scope (see
[[gas-global-init-order]] for the load-order half of that hazard). Left alone, every top-level
`function` and every top-level `var`/`let`/`const` in every file becomes globally visible — not
just to other `.gs` files, but to anything that can call a global function by name: web-app
clients via `google.script.run`/`Script.html`'s `_runGasCall(fnName, args)` bracket dispatch,
HtmlService template scriptlets (`<?= func() ?>`), time-driven triggers looked up by handler-name
string (`ScriptApp.newTrigger('name')`), and the Apps Script IDE's manual "select function, click
Run" dropdown.

Each `.gs` file is wrapped in its own IIFE so that's no longer true by default:

```javascript
(function(global) {

function somePrivateHelper() { ... }   // invisible outside this file

function someExportedFn() { ... }

global.someExportedFn = someExportedFn;

})(this);
```

`this` at the top level of a `.gs` file is the shared global object, so `global.x = x` at the
bottom is the only channel that makes a name reachable from another file or from any of the
client/template/trigger/IDE surfaces above. Function-declaration hoisting still works *inside* a
file, but no longer leaks *across* files unless explicitly exported.

- MUST wrap every `gas-app/*.gs` file's body in `(function(global) { ... })(this);`.
- MUST export a name (`global.name = name;`) if and only if it is actually called from one of:
  a `google.script.run`/`_runGasCall` site in an `.html` file, an HtmlService template scriptlet,
  a trigger handler-name string, the Apps Script IDE manual-run dropdown (documented as such via
  an "IDE Setup Helper"/"IDE manual-run" JSDoc note), or another `.gs` file (GAS has no `import` —
  the shared global object is the only cross-file channel, so a function or literal-only constant
  used by another file must be exported even if no client ever touches it directly).
- **`global.name = name;` alone is NOT enough for `google.script.run`, `doGet`, `onOpen`, or the
  IDE manual-run dropdown.** Those four surfaces are populated by Apps Script's own static AST
  scan of the project source for top-level `function name(...) { ... }` declarations — a name
  that exists only as a runtime property assignment inside the IIFE is invisible to that scan.
  `Code.gs` therefore has a **second block after `})(this);`** ("Top-level entry points for
  Google Apps Script runtime & IDE") containing a thin top-level delegator per such name, e.g.:
  ```javascript
  function saveDailyDocCards(dateStr, noteContent) {
    return (typeof _saveDailyDocCardsInternal === 'function')
      ? _saveDailyDocCardsInternal(dateStr, noteContent)
      : (globalThis._saveDailyDocCardsInternal ? globalThis._saveDailyDocCardsInternal(dateStr, noteContent) : null);
  }
  ```
  which calls the `global._xInternal = x` alias set inside the IIFE. **Any new function reachable
  from `google.script.run`/`doGet`/`onOpen`/a trigger name string/the IDE dropdown needs BOTH**:
  the `global._xInternal = x` alias inside the IIFE, AND a matching top-level delegator in that
  second block — adding only the alias (as this codebase's own STT-fallback feature initially did)
  produces a function that calls cleanly from other `.gs` files but returns `undefined` from
  `typeof google.script.run.x` client-side, with no error and no obvious signal beyond that. Symptoms:
  a real Apps Script propagation/caching delay looks IDENTICAL from the outside (both present as
  "the new function silently isn't callable via google.script.run yet") — rule out the missing
  delegator FIRST via `grep -c "^function <name>" gas-app/Code.gs` (should be 2: one inside the
  IIFE, one in the top-level block) before assuming it's a timing issue and waiting it out.
- MUST NOT export a helper only ever called from within its own file — that defeats the point of
  the wrap. Before adding an export, check every call site; before removing one, grep every
  `.html` file's `google.script.run`/`_runGasCall` calls, every `<?= ?>`/`<?!= ?>` template
  scriptlet, every `ScriptApp.newTrigger(...)` handler-name string, and every other `.gs` file for
  a reference to it.
- Each file's export block MUST carry a one-line comment per export naming which surface needs it
  (`// google.script.run: Script.html`, `// IDE manual-run`, `// used by UnitTests.gs`, etc.) —
  the list is a security-relevant RPC surface, not incidental structure, so its reasoning must
  stay legible without re-deriving it from a fresh grep every time.
- Do not re-indent a file's existing body just to wrap it — the IIFE only needs an opening line
  after the `@file` header and a closing `})(this);` + export block at EOF; a pure wrap with no
  line-by-line diff is easier to review and revert than a reformat.

**Why:** the user explicitly asked to stop polluting GAS's shared global namespace with a
polyfilled import/export pattern, and pointed out this is also a security control, not just
style — in a GAS web-server app, whatever's globally reachable *is* the client-callable RPC
surface (`google.script.run` calls a name, not a module member), so an unexported helper is one a
malicious or buggy client script literally cannot invoke. This caught one real bug during the
refactor: `Code.gs` had a dead duplicate `testDoGetInIDE` shadowed by `UnitTests.gs`'s copy
(load-order dependent, invisible without enumerating the full global surface) — enforcing an
explicit list is what surfaced it.

**How to apply:** any new `.gs` file must follow this pattern from creation. Any new function
added to an existing `.gs` file needs a deliberate include/exclude decision, not a default
inclusion — check the call sites above before adding it to the export block. See `gas-app/Code.gs`
and `gas-app/UnitTests.gs` for the reference implementation.
