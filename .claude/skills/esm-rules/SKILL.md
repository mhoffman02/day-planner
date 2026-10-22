---
name: esm-rules
description: "ESM rules for this project's Node.js files: the entry-point guard (fileURLToPath, not file:// concat) and a syntax check after every edit. USE FOR: writing or editing ESM tools/scripts, debugging a script that silently exits 0 with no output. DO NOT USE FOR: CJS or non-JS files."
tags: [esm, nodejs, windows, entry-point, syntax-validation, tools]
version: 2.0.0
---

# ESM Rules

## Rule 1: Entry-point guard

MUST use:

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => { console.error(err.stack); process.exit(1); });
}
```

MUST NOT use `if (import.meta.url === \`file://${process.argv[1]}\`)`. On Windows `import.meta.url` is
`file:///C:/Users/foo/x.js` while the concatenation gives `file://C:\Users\foo\x.js` (two slashes, backslashes), so
the guard never fires: the script exits 0 with no output and every flag seems to "succeed". Both sides of the
correct form are OS-native absolute paths. `process.argv[1] &&` avoids a crash under `node -e`, where it is undefined.
An `isMain` const holding the same expression is equally fine.

Apply when writing a script meant to run directly, when editing a file with the broken form, and after any edit to a
file containing `import.meta.url`.

## Rule 2: Validate right after every `.js` edit

```bash
node --input-type=module --eval "import('./path/to/file.js').then(()=>console.log('OK')).catch(e=>{console.error(e.message);process.exit(1)})"
node --check path/to/file.js   # parse-only, no side effects
```

Catches duplicate imports or module-scope `const`/`let`, missing braces from multi-step edits, and `await` outside
async. Run it after each edit, once more before committing or a handoff, and before spawning subagents that depend
on the file. A subagent that edits a `.js` file MUST pass this check before reporting back.

**Why:** a multi-pass edit once left duplicate `import fs` / `const _ROOT` declarations that only the pre-commit hook
caught, after the handoff had already started. One `node` command at edit time costs ~1 s.
