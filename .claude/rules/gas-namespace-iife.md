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
