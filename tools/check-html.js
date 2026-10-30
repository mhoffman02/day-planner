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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['index.html', 'gas-app/Index.html'];
const BASELINE_FILE = path.join(ROOT, 'html-baseline.json');
const KEPT_BINDINGS = /^(href|src|alt|title|aria-[\w-]+|role|placeholder|label)$/;

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
  if (!ok) process.exit(1);
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
