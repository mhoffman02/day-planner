---
paths: ["gas-app/**"]
---

# GAS IIFE Namespace / Explicit Export Surface

All `gas-app/*.gs` share one global scope ([[gas-global-init-order]] covers load order). Whatever is global is client-callable: `google.script.run`/`_runGasCall`, HtmlService scriptlets, trigger handler-name strings, the IDE Run dropdown. So the export list is a security-relevant RPC surface.

```javascript
(function(global) {
function privateHelper() { ... }          // invisible outside this file
function exportedFn() { ... }
global.exportedFn = exportedFn;           // google.script.run: Script.html
})(this);
```

- Wrap every `.gs` body in `(function(global) { ... })(this);`. Don't re-indent the body; a pure wrap diffs cleanly.
- Export (`global.name = name;`) iff called from: a `google.script.run`/`_runGasCall` site in `.html`, a template scriptlet, a trigger name string, the IDE manual-run dropdown (JSDoc "IDE manual-run" note), or another `.gs` (no `import`; the global is the only cross-file channel).
- Never export a helper used only in its own file. Before adding or removing an export, grep every `.html` `google.script.run`/`_runGasCall`, every `<?= ?>`/`<?!= ?>`, every `ScriptApp.newTrigger(...)` string and every other `.gs`.
- One comment per export naming its surface (`// google.script.run: Script.html`, `// IDE manual-run`, `// used by UnitTests.gs`).
- **`global.name = name;` alone is NOT enough for `google.script.run`, `doGet`, `onOpen` or the IDE dropdown.** Apps Script finds those by a static scan for top-level `function name(...)` declarations. `Code.gs` has a second block after `})(this);` ("Top-level entry points for Google Apps Script runtime & IDE") with a thin delegator per name:
  ```javascript
  function saveDailyDocCards(dateStr, noteContent) {
    return (typeof _saveDailyDocCardsInternal === 'function')
      ? _saveDailyDocCardsInternal(dateStr, noteContent)
      : (globalThis._saveDailyDocCardsInternal ? globalThis._saveDailyDocCardsInternal(dateStr, noteContent) : null);
  }
  ```
  A new RPC-reachable function needs BOTH the `global._xInternal = x` alias inside the IIFE AND its top-level delegator. Alias alone: callable from other `.gs`, but `typeof google.script.run.x` is `undefined` client-side with no error. This looks identical to Apps Script propagation delay, so rule out the delegator first: `grep -c "^function <name>" gas-app/Code.gs` must be 2.
- New `.gs` files follow this pattern from creation; each new function needs a deliberate include/exclude decision. Reference: `gas-app/Code.gs`, `gas-app/UnitTests.gs`.

**Why:** user asked to stop polluting GAS's shared global namespace, noting it is a security control: an unexported helper cannot be invoked by a malicious or buggy client script. The refactor also surfaced a dead duplicate `testDoGetInIDE` in `Code.gs`, shadowed by `UnitTests.gs` (load-order dependent).
