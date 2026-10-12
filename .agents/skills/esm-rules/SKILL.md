---
name: esm-rules
description: "ESM-specific rules for Node.js files in this project — entry-point guard pattern (fileURLToPath vs broken file:// concat) and post-edit syntax validation. USE FOR: writing new ESM tools/scripts, editing existing .js files that use import/export, debugging scripts that silently exit 0 with no output. DO NOT USE FOR: CJS files, non-JS files, general coding tasks."
tags: [esm, nodejs, windows, entry-point, syntax-validation, tools]
version: 1.0.0
---

# ESM Rules — Entry-Point Guard + Post-Edit Validation

Two rules that fire on every `.js` file write in this project.

---

## Rule 1: ESM Entry-Point Guard

When writing the "is this the main script?" guard in an ESM file, **always** use:

```js
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
```

**Never** use the broken string-concatenation pattern:

```js
// ❌ BROKEN ON WINDOWS — silently never fires
if (import.meta.url === `file://${process.argv[1]}`) {
```

### Why the broken pattern fails on Windows

| Value | Example |
|---|---|
| `import.meta.url` | `file:///C:/Users/foo/project/tools/script.js` |
| `process.argv[1]` | `C:\Users\foo\project\tools\script.js` |
| `"file://" + process.argv[1]` | `file://C:\Users\foo\project\tools\script.js` |

The concatenated string has **two** slashes (not three), **backslashes** (not forward slashes),
and no drive-letter colon encoding — it never equals `import.meta.url`. The script exits 0
with zero output. Every flag (`--status`, `--dry-run`, `--help`) appears to silently succeed.
This is the exact failure observed 2026-07-08 in `smoke-fix-runner.js` and `probe-fix-loop.js`.

### The correct fix — use Node's own libs, no manual slash handling

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => { console.error(err.stack); process.exit(1); });
}
```

- `fileURLToPath(import.meta.url)` → OS-native absolute path (e.g. `C:\Users\foo\...\script.js`)
- `path.resolve(process.argv[1])` → OS-native absolute path (resolves relative paths too)
- Both sides are the same type; comparison works on Windows **and** POSIX with zero manual
  slash replacement.

The `process.argv[1] &&` guard prevents a crash when the file is loaded via `node -e "..."`,
where `argv[1]` is `undefined`.

### Required imports

Both `path` and `fileURLToPath` must be imported. If the file already imports `fileURLToPath`
for `__dirname`/`__filename` (common pattern), only `path` needs to be added.

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
```

### Known-good alternative (seed-tracker.js pattern)

`tools/seed-tracker.js` uses a slightly different but equally correct form:

```js
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) { main(); }
```

Both forms are acceptable. The inline `if` form is preferred for brevity.

### When to apply this rule

- Any time you write a new ESM tool/script that should only run when invoked directly.
- Any time you edit an existing file that uses the broken `file:// + argv[1]` pattern.
- After any `Edit` or `Write` to a `.js` file that contains `import.meta.url` — check the
  guard pattern before moving on.

### Files fixed 2026-07-08

- `tools/smoke-fix-runner.js` ✅
- `tools/probe-fix-loop.js` ✅
- `tools/refresh-file-index.js` ✅
- `tools/run-discovery-snippet.js` ✅

### Files still needing fix (as of 2026-07-08)

- `tools/field-mapper/dist/index.js`
- `tools/field-mapper/src/index.js`
- `utils/api/auth.js`

Fix these the next time those files are edited (opportunistic — not worth a dedicated pass).

---

## Rule 2: ESM Validate on Edit

After writing or editing **any** `.js` file that uses ESM (`import`/`export`), immediately
run a syntax + duplicate-declaration check before doing anything else (committing, running
tests, writing the handoff).

### Required validation command

```bash
node --input-type=module --eval "import('./path/to/file.js').then(()=>console.log('OK')).catch(e=>{console.error(e.message);process.exit(1)})"
```

Or for a quick parse-only check (no side effects):

```bash
node --check path/to/file.js   # CJS syntax check (catches most parse errors)
```

For ESM files that use top-level `import` (not dynamic), use the import() form above.

### What this catches

- Duplicate `import` declarations (`SyntaxError: Identifier 'fs' has already been declared`)
- Duplicate `const`/`let` at module scope (`SyntaxError: Identifier '_ROOT' has already been declared`)
- Missing closing braces / syntax errors introduced by multi-step edits
- `await` outside async context

### When to run it

| Trigger | Action |
|---|---|
| After any `Edit` or `Write` to a `.js` file | Run the import check immediately |
| After a multi-step edit session on the same file | Run once at the end of the session |
| Before writing a handoff or committing | Run on every modified `.js` file |
| Before spawning subagents that depend on the file | Run first so subagents don't inherit broken code |

### Why this rule exists

Session 2026-06-20: `utils/probe/probe-hud.js` was edited in multiple passes. A stale
block containing duplicate `import fs`, `import path`, `const _ROOT`, and `function _flushMonkeyEvent`
declarations was left in the file. The pre-commit hook caught it, but only after `node tools/handoff.js`
was already running. The fix was trivial (delete the stale block) but the error should have been
caught immediately after the edit, not at commit time.

**Cost of not catching early**: broken pre-commit → failed handoff → manual fix → re-run handoff.
**Cost of catching early**: one `node` command, ~1 second.

### Subagent rule

Any subagent that edits a `.js` file MUST run this check before returning results to the
orchestrator. If the check fails, fix the file and re-check — do not return broken code.
