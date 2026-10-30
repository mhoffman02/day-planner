#!/usr/bin/env node
// @file HTML validity + accessibility gate (solid-code item 7) for the two page shells, index.html (local
// preview) and gas-app/Index.html (GAS). html-validate cannot read Alpine, so each file is first mapped
// to the static page Alpine would render: a bound attribute that matters for validity or a11y (:href,
// :aria-label, ...) becomes a plain one, other bindings (:class, :disabled) are dropped, and an element
// whose text comes from x-text or x-html gets placeholder text. Line numbers are preserved.
//
// Findings are ratcheted per file and rule in html-baseline.json: a count may fall, never rise.
// Usage: npm run check:html            (fail on any rise)
//        npm run check:html -- --update  (lower the baseline to the current counts)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HtmlValidate } from 'html-validate';
import * as acorn from 'acorn';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['index.html', 'gas-app/Index.html'];
const BASELINE_FILE = path.join(ROOT, 'html-baseline.json');
const KEPT_BINDINGS = /^(href|src|alt|title|aria-[\w-]+|role|placeholder|label)$/;
// Hard rules (0 today, so no baseline): dynamic HTML is escaped at output by these two only (6f25dc2),
// and no stadium/circle radius (no-pills.md; c957ba2, 7f8e432).
const HARD_RULE_FILES = [...FILES, 'src/styles.css', 'gas-app/Styles.html'];
const SANITIZERS = new Set(['formatEventDescription', 'renderCardLine']);
const PILL_RADIUS_RE = /border-radius:\s*(50%|\d{3,}px|99px)/g;

/** @returns {boolean} The x-html expression yields only sanitizer output or string literals. */
function isSanitized(node) {
  if (node.type === 'Literal') return typeof node.value === 'string';
  if (node.type === 'ConditionalExpression') return isSanitized(node.consequent) && isSanitized(node.alternate);
  return node.type === 'CallExpression' && node.callee.type === 'Identifier' && SANITIZERS.has(node.callee.name);
}

/**
 * @param {string} file Name used in messages.
 * @param {string} text File content.
 * @returns {string[]} `file:line: reason` for each x-html bypass or pill radius.
 */
export function hardRuleViolations(file, text) {
  const out = [];
  const lineOf = (index) => text.slice(0, index).split('\n').length;
  for (const m of text.matchAll(/x-html="([^"]*)"/g)) {
    let ok = false;
    try {
      ok = isSanitized(acorn.parseExpressionAt(m[1].replace(/&#39;|&apos;/g, "'"), 0, { ecmaVersion: 'latest' }));
    } catch (err) {
      console.error(`check-html: ${file}:${lineOf(m.index)} x-html is not a parseable expression, reported as unsanitized\n${err.stack}`);
    }
    if (!ok) out.push(`${file}:${lineOf(m.index)}: x-html="${m[1]}" must go through formatEventDescription/renderCardLine (escape at output)`);
  }
  for (const m of text.matchAll(PILL_RADIUS_RE)) {
    out.push(`${file}:${lineOf(m.index)}: border-radius ${m[1]} is a pill/circle (no-pills.md)`);
  }
  return out;
}

export function alpineToStatic(html) {
  return html
    .replace(/(\s)(?::|x-bind:)([a-zA-Z][\w-]*)="[^"]*"/g,
      (all, space, name) => (KEPT_BINDINGS.test(name) ? `${space}${name}="x"` : ''))
    .replace(/(<([a-z][\w-]*)\b[^>]*\sx-(?:text|html)="[^"]*"[^>]*>)(\s*<\/\2>)/g, '$1x$3');
}

export async function countFindings(html, name) {
  const hv = new HtmlValidate({
    extends: ['html-validate:recommended'],
    // House style, not correctness: inline styles are used deliberately; whitespace is lint noise.
    rules: { 'no-inline-style': 'off', 'no-trailing-whitespace': 'off' },
  });
  const report = await hv.validateString(alpineToStatic(html), name);
  const messages = report.results.flatMap((r) => r.messages);
  const counts = {};
  for (const m of messages) counts[m.ruleId] = (counts[m.ruleId] || 0) + 1;
  return { counts, messages };
}

export function compareToBaseline(file, counts, baseline) {
  const base = baseline[file] || {};
  return Object.entries(counts)
    .filter(([rule, n]) => n > (base[rule] || 0))
    .map(([rule, n]) => `${file}: ${rule} ${n} > baseline ${base[rule] || 0}`);
}

async function main() {
  const { ok } = await runCheck({ root: ROOT, files: FILES, baselineFile: BASELINE_FILE, update: process.argv.includes('--update') });
  const hard = HARD_RULE_FILES.flatMap((f) => hardRuleViolations(f, fs.readFileSync(path.join(ROOT, f), 'utf8')));
  if (hard.length) console.error(`❌ ${hard.join('\n❌ ')}`);
  else console.log(`✅ x-html only via sanitizers, no pill radii in ${HARD_RULE_FILES.join(', ')}`);
  if (!ok || hard.length) process.exit(1);
}

/**
 * Checks `files` against the baseline. With `update`, writes the baseline: an existing file only
 * lowers counts, and a rule it does not list is never admitted (only a missing baseline is seeded).
 */
export async function runCheck({ root, files, baselineFile, update = false, log = console.log }) {
  const seeding = !fs.existsSync(baselineFile);
  const baseline = seeding ? {} : JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  const next = {};
  const errors = [];
  for (const file of files) {
    const { counts, messages } = await countFindings(fs.readFileSync(path.join(root, file), 'utf8'), file);
    next[file] = counts;
    const rises = compareToBaseline(file, counts, baseline);
    errors.push(...rises);
    for (const rule of rises.map((r) => r.split(' ')[1])) {
      for (const m of messages.filter((x) => x.ruleId === rule)) log(`  ${file}:${m.line}:${m.column} [${rule}] ${m.message}`);
    }
  }
  if (update) {
    const lowered = {};
    for (const file of files) {
      lowered[file] = {};
      for (const [rule, n] of Object.entries(next[file])) {
        const base = (baseline[file] || {})[rule];
        if (seeding) lowered[file][rule] = n;
        else if (base !== undefined) lowered[file][rule] = Math.min(n, base);
      }
    }
    fs.writeFileSync(baselineFile, `${JSON.stringify(lowered, null, 2)}\n`);
    log(`✅ ${path.basename(baselineFile)} updated (counts only go down)`);
    return { ok: true, errors };
  }
  if (errors.length) {
    log(`❌ new HTML/a11y findings:\n❌ ${errors.join('\n❌ ')}`);
    return { ok: false, errors };
  }
  log(`✅ HTML/a11y: no new findings in ${files.join(', ')}`);
  return { ok: true, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('check-html failed:', err.stack);
    process.exit(1);
  });
}
