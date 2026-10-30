#!/usr/bin/env node
// @file Mirror-drift gate. src/*.js and src/styles.css are hand-copied into gas-app/Script.html and
// gas-app/Styles.html. Same-name functions (and CSS rules) are compared after dropping comments,
// whitespace and the var/let/const keyword; any other difference counts. src/gasBridge.js and
// src/hubMock.js are mock-only and excluded. Names that differ today live in mirror-baseline.json
// as `file:function` / `styles.css:<selector>`: a NEW name fails, `--update` only removes names
// that now match, and a missing baseline is seeded once.
// Usage: node tools/check-mirror.js            (fail on new drift)
//        node tools/check-mirror.js --update   (drop baseline names that now match)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = path.join(ROOT, 'mirror-baseline.json');
const EXCLUDED = new Set(['gasBridge.js', 'hubMock.js']);
const BLOCK_AT_RULES = /^@(media|supports|layer|container)\b/;

function parse(code, sourceType, label, comments) {
  try {
    return acorn.parse(code, { ecmaVersion: 'latest', sourceType, allowReturnOutsideFunction: true, onComment: comments });
  } catch (err) {
    console.error(`check-mirror: cannot parse ${label}\n${err.stack}`);
    throw err;
  }
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => walk(c, visit));
    else if (v && typeof v.type === 'string') walk(v, visit);
  }
}

/**
 * @param {string} code JavaScript source.
 * @param {'module'|'script'} sourceType How to parse it.
 * @param {string} [label] Name used in error messages.
 * @returns {Map<string, Set<string>>} `name` (declaration) or `m:name` (method) to its normalized source variants.
 */
export function functionVariants(code, sourceType, label = 'source') {
  const comments = [];
  const ast = parse(code, sourceType, label, comments);
  const norm = (node) => {
    let text = '';
    let at = node.start;
    for (const c of comments.filter((x) => x.start >= node.start && x.end <= node.end)) {
      text += code.slice(at, c.start);
      at = c.end;
    }
    text += code.slice(at, node.end);
    return text.replace(/\b(const|let|var)\b/g, 'V').replace(/\s+/g, '');
  };
  const out = new Map();
  const add = (key, node) => {
    if (!out.has(key)) out.set(key, new Set());
    out.get(key).add(norm(node));
  };
  walk(ast, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id) add(n.id.name, n);
    if ((n.type === 'Property' || n.type === 'MethodDefinition') && !n.computed && n.key.type === 'Identifier'
      && /Function/.test(n.value.type)) add(`m:${n.key.name}`, n.value);
  });
  return out;
}

const squash = (s) => s.replace(/\s+/g, '');

/** @returns {Map<string, string>} CSS rule key (`@media ... > selector`) to its normalized text. */
export function cssRules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Map();
  const put = (key, value) => out.set(key, out.has(key) ? `${out.get(key)}${value}` : value);
  (function scan(from, to, prefix) {
    let i = from;
    while (i < to) {
      let j = i;
      let depth = 0;
      let quote = '';
      for (; j < to; j++) {
        const ch = text[j];
        if (quote) { if (ch === quote) quote = ''; } else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (depth === 0 && (ch === '{' || ch === ';')) break;
      }
      const prelude = text.slice(i, j).replace(/\s+/g, ' ').trim();
      if (j >= to || text[j] === ';') {
        if (prelude) put(`${prefix}${prelude}`, `${prelude};`);
        i = j + 1;
        continue;
      }
      let level = 1;
      let k = j + 1;
      for (; k < to && level > 0; k++) {
        if (text[k] === '{') level++;
        else if (text[k] === '}') level--;
      }
      if (level > 0) throw new Error(`check-mirror: unbalanced braces in CSS near "${prelude}"`);
      if (BLOCK_AT_RULES.test(prelude)) scan(j + 1, k - 1, `${prefix}${prelude} > `);
      else put(`${prefix}${prelude}`, `${squash(prelude)}{${squash(text.slice(j + 1, k - 1)).replace(/;$/, '')}}`);
      i = k;
    }
  })(0, text.length, '');
  return out;
}

/** @returns {string[]} Sorted `file:function` / `styles.css:<rule>` names whose src copy differs from the GAS copy. */
export function diffNames({ srcFiles, scriptHtml, srcCss, gasCss }) {
  const gas = new Map();
  for (const m of scriptHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    const block = m[1].replace(/<\?[!=]?[\s\S]*?\?>/g, '0');
    for (const [key, set] of functionVariants(block, 'script', 'gas-app/Script.html')) {
      if (!gas.has(key)) gas.set(key, new Set());
      for (const v of set) gas.get(key).add(v);
    }
  }
  const names = [];
  for (const [file, code] of Object.entries(srcFiles)) {
    for (const [key, set] of functionVariants(code, 'module', `src/${file}`)) {
      const mirror = gas.get(key);
      if (mirror && [...set].some((v) => !mirror.has(v))) names.push(`${file}:${key}`);
    }
  }
  const a = cssRules(srcCss);
  const b = cssRules(gasCss.replace(/<\/?style[^>]*>/g, ''));
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    if (a.get(key) !== b.get(key)) names.push(`styles.css:${key}`);
  }
  return names.sort();
}

function currentDrift(root) {
  const srcDir = path.join(root, 'src');
  const srcFiles = {};
  for (const f of fs.readdirSync(srcDir).filter((n) => n.endsWith('.js') && !EXCLUDED.has(n))) {
    srcFiles[f] = fs.readFileSync(path.join(srcDir, f), 'utf8');
  }
  return diffNames({
    srcFiles,
    scriptHtml: fs.readFileSync(path.join(root, 'gas-app/Script.html'), 'utf8'),
    srcCss: fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8'),
    gasCss: fs.readFileSync(path.join(root, 'gas-app/Styles.html'), 'utf8'),
  });
}

/** Checks mirror drift against the baseline (seed once; update only removes). */
export function runCheck({ root, baselineFile, update = false, log = console.log }) {
  const drift = currentDrift(root);
  if (!fs.existsSync(baselineFile)) {
    fs.writeFileSync(baselineFile, `${JSON.stringify(drift, null, 2)}\n`);
    log(`✅ ${path.basename(baselineFile)} seeded with ${drift.length} drifted names`);
    return { ok: true, added: [], stale: [] };
  }
  const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  const added = drift.filter((n) => !baseline.includes(n));
  const stale = baseline.filter((n) => !drift.includes(n)).sort();
  if (update) {
    fs.writeFileSync(baselineFile, `${JSON.stringify(baseline.filter((n) => !stale.includes(n)), null, 2)}\n`);
    log(`✅ ${path.basename(baselineFile)} updated (removed ${stale.length}, names only ever leave)`);
    return { ok: true, added, stale };
  }
  if (added.length) {
    log(`❌ src and gas-app copies drifted apart (not in baseline):\n❌ ${added.join('\n❌ ')}`);
    return { ok: false, added, stale };
  }
  log(`✅ Mirror: ${drift.length} drifted (baseline ${baseline.length}), none new${stale.length ? `; ${stale.length} now match, run --update` : ''}`);
  return { ok: true, added, stale };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { ok } = runCheck({ root: ROOT, baselineFile: BASELINE_FILE, update: process.argv.includes('--update') });
    if (!ok) process.exit(1);
  } catch (err) {
    console.error('check-mirror failed:', err.stack);
    process.exit(1);
  }
}
