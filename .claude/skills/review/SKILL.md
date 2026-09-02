---
name: review
description: Perform code quality, safety, and synchronization review on day-planner uncommitted changes or specific files.
tags: [review, code-review, quality, esm, day-planner]
version: 2.0.0
---

# Day Planner Code Review Skill

Default scope: uncommitted changes (`git diff`/`git status`) or specific files named in the
request. Only sweep the full codebase when explicitly asked for a full-tree pass.

Performs code quality review on that scope, targeting:
1. **Staged-File Hygiene**: Verify no unintended files or scratch logs are staged.
2. **ESM Import Specifiers**: Ensure relative imports in `src/` use explicit `.js` extensions.
3. **Dual Target Parity**: Run `npm run build:gas:check` first — it's a free, mechanical
   check covering `taskEngine.js`, `futureMatrixEngine.js`, `syncEngine.js`,
   `indexedDbStore.js`, and `binderStore.js#getLocalDateStr`. Only `src/gasBridge.js` is
   hand-duplicated; if it changed, diff it against `gas-app/Script.html`'s `GASBridge`
   class only (`grep -n "class GASBridge" gas-app/Script.html` to find its bounds) —
   never read the whole file for this.
4. **No Console Pollutants**: Ensure clean error handling without leftover debugging output.
5. **Test Pass**: Run `npm test` before committing.
