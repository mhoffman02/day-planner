#!/usr/bin/env node
/**
 * @file CSS design-token gate. Colors, spacing, z-index and sizes are defined once as custom properties and
 * consumed with var(--token); no local magic literals. Copy to tools/, set FILES, add to `npm run lint`.
 *
 * Rules (counted per file):
 *   magic-color   hex/rgb()/hsl() literal outside a `--token:` definition
 *   magic-z       z-index number literal (use var(--z-*))
 *   important     !important
 *   id-selector   #id in a selector (style by class or element)
 *   px-font       font-size in px (use rem, so user text-size settings work)
 *   outline-none  outline: none/0 on a rule with no :focus-visible replacement in the same rule
 *   no-reduced-motion  file has transition/animation but no prefers-reduced-motion block
 *
 * New project: baseline is {} (zero). Legacy: `--update` writes css-baseline.json and only ever lowers it.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILES = ['src/styles.css'];
const BASELINE = 'css-baseline.json';
const RULES = ['magic-color', 'magic-z', 'important', 'id-selector', 'px-font', 'outline-none', 'no-reduced-motion'];

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;

/** @param {string} css @returns {Record<string, number>} violation count per rule id */
export function checkCss(css) {
  const counts = Object.fromEntries(RULES.map((r) => [r, 0]));
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  // Walk top-level and nested blocks; remember the selector that owns each declaration list.
  const re = /([^{}]*)\{|\}/g;
  const stack = [];
  let last = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m[0] === '}') {
      stack.pop();
      last = re.lastIndex;
      continue;
    }
    const selector = m[1].trim();
    const decls = text.slice(last, m.index);
    // Declarations that sit directly in the parent block, before this child opens.
    if (stack.length) scanDecls(decls, stack[stack.length - 1], counts);
    if (!selector.startsWith('@') && /(^|[\s>+~,(])#[A-Za-z_-]/.test(selector)) counts['id-selector']++;
    stack.push(selector);
    last = re.lastIndex;
    const close = text.indexOf('}', re.lastIndex);
    const open = text.indexOf('{', re.lastIndex);
    if (close !== -1 && (open === -1 || close < open)) {
      scanDecls(text.slice(re.lastIndex, close), selector, counts);
    }
  }
  if (/\b(transition|animation)\s*:/.test(text) && !/prefers-reduced-motion/.test(text)) counts['no-reduced-motion']++;
  return counts;
}

function scanDecls(block, selector, counts) {
  const body = block.split(';').map((d) => d.trim()).filter(Boolean);
  let outlineOff = false;
  for (const d of body) {
    if (/^--/.test(d)) continue;                                   // token definition: literals allowed here
    if (COLOR_RE.test(d)) counts['magic-color']++;
    if (/^z-index\s*:\s*-?\d/.test(d)) counts['magic-z']++;
    if (/!important/.test(d)) counts.important++;
    if (/^font-size\s*:[^;]*\d\s*px\b/.test(d)) counts['px-font']++;
    if (/^outline\s*:\s*(none|0)\b/.test(d)) outlineOff = true;
  }
  if (outlineOff && !/:focus-visible/.test(selector)) counts['outline-none']++;
}

export function compare(counts, baseline) {
  const errors = [];
  for (const r of RULES) {
    const base = baseline[r] ?? 0;
    if (counts[r] > base) errors.push(`${r}: ${counts[r]} > baseline ${base}`);
  }
  return errors;
}

function main() {
  const update = process.argv.includes('--update');
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
  const next = {};
  const errors = [];
  for (const file of FILES) {
    const counts = checkCss(readFileSync(file, 'utf8'));
    const base = baseline[file] ?? {};
    for (const e of compare(counts, base)) errors.push(`${file} ${e}`);
    next[file] = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
  }
  if (update) {
    if (errors.length && existsSync(BASELINE)) {
      console.error(`css gate: refusing to raise the baseline\n${errors.join('\n')}`);
      process.exit(1);
    }
    writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
    return;
  }
  if (errors.length) {
    console.error(`css gate failed (use var(--token), no !important, no id selectors):\n${errors.join('\n')}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
