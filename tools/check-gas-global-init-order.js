#!/usr/bin/env node
/**
 * @file tools/check-gas-global-init-order.js
 * @description Flags top-level `var`/`let`/`const` initializers in gas-app/*.gs that are not
 * pure literals. All .gs files in an Apps Script project share one global scope and execute as
 * if concatenated, but Apps Script does not document or guarantee cross-file load order --
 * function declarations are hoisted (always safe to call cross-file), but a top-level
 * initializer that calls a function/service or reads another global can silently see
 * `undefined` if the defining file hasn't loaded yet. See
 * .agents/rules/gas-global-init-order.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GAS_DIR = path.join(ROOT, 'gas-app');

const LITERAL_KEYWORDS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);
const TOP_LEVEL_DECL_RE = /^(var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*/gm;

let errors = 0;
let filesChecked = 0;

/**
 * From `text` starting at `start`, finds the end index of the initializer expression -- the
 * first top-level (bracket/paren/brace-depth 0) `;` or newline, skipping over string/template
 * literal contents so a `;` inside a string doesn't terminate early.
 * @param {string} text Full file content.
 * @param {number} start Index right after the `=`.
 * @returns {number} Index of the initializer's end (exclusive).
 */
function findInitializerEnd(text, start) {
  let depth = 0;
  let inString = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; continue; }
    if (depth === 0 && (ch === ';' || ch === '\n')) return i;
  }
  return text.length;
}

/**
 * Checks whether an initializer expression is safe to run at arbitrary cross-file load order:
 * a literal (string/number/boolean/regex, or array/object built only from literals) with no
 * function/method calls, `new` expressions, or bare identifier references to other globals.
 * @param {string} expr Initializer expression text (already isolated by findInitializerEnd).
 * @returns {string|null} A short reason string if unsafe, or null if safe.
 */
function findUnsafeReason(expr) {
  const trimmed = expr.trim();
  if (trimmed === '') return null;

  // A regex literal as the entire initializer (e.g. `/^foo(.+?)bar/`) -- division right after
  // `=` is not a realistic pattern in this codebase, so treat a leading `/` as opaque and safe.
  if (/^\/.*\/[a-z]*$/.test(trimmed)) return null;

  // Strip string/template literal contents so a call-like substring inside a string doesn't
  // false-positive (findInitializerEnd already guarantees balanced quotes up to this point).
  const stripped = trimmed.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');

  if (/[A-Za-z_$][\w$]*\s*\(/.test(stripped)) return 'calls a function/method';
  if (/\bnew\s+[A-Za-z_$]/.test(stripped)) return 'uses `new`';

  if (/^[A-Za-z_$][\w$]*$/.test(stripped) && !LITERAL_KEYWORDS.has(stripped)) {
    return 'references another identifier/global directly';
  }

  return null;
}

const files = fs.existsSync(GAS_DIR)
  ? fs.readdirSync(GAS_DIR).filter((f) => f.endsWith('.gs')).map((f) => path.join(GAS_DIR, f))
  : [];

for (const file of files) {
  filesChecked++;
  const content = fs.readFileSync(file, 'utf8');
  const relFile = path.relative(ROOT, file);

  let match;
  TOP_LEVEL_DECL_RE.lastIndex = 0;
  while ((match = TOP_LEVEL_DECL_RE.exec(content)) !== null) {
    const name = match[2];
    const initStart = match.index + match[0].length;
    const initEnd = findInitializerEnd(content, initStart);
    const expr = content.slice(initStart, initEnd);
    const reason = findUnsafeReason(expr);
    if (reason) {
      const line = content.slice(0, match.index).split('\n').length;
      console.error(`❌ [GAS GLOBAL INIT ORDER] ${relFile}:${line}: top-level '${name}' initializer ${reason} -- unsafe across .gs file load order, initialize lazily inside a function instead.`);
      errors++;
    }
  }
}

if (errors > 0) {
  console.error(`\n❌ Found ${errors} unsafe top-level GAS global initializer(s) across ${filesChecked} file(s). See .agents/rules/gas-global-init-order.md.`);
  process.exit(1);
} else {
  console.log(`✅ All top-level GAS globals in ${filesChecked} file(s) are load-order-safe literals.`);
  process.exit(0);
}
