#!/usr/bin/env node
// @file RPC boundary gate (solid-code): each top-level delegator in gas-app/Code.gs that takes
// parameters is a google.script.run entry point. Its implementation (the function assigned to
// `global._<name>Internal`) must validate its args first through v_ (`v_.guard(arguments, ...)` or
// `v_.fn(...)`). Entries that are not guarded yet are ratcheted in rpc-guard-baseline.json: a new
// unguarded RPC fails, `--update` only removes names that are now guarded or gone, never adds.
// Usage: node tools/check-rpc-guards.js            (fail on a new unguarded entry point)
//        node tools/check-rpc-guards.js --update   (drop baseline names that are now fine)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = path.join(ROOT, 'rpc-guard-baseline.json');
const INTERNAL_RE = /^_(\w+)Internal$/;

function parse(text, label) {
  try {
    return acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
  } catch (err) {
    console.error(`check-rpc-guards: cannot parse ${label}\n${err.stack}`);
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

// Called by the platform (simple triggers, web app requests), never by google.script.run.
const PLATFORM_HANDLERS = new Set(['onOpen', 'onInstall', 'onEdit', 'onSelectionChange', 'onFormSubmit', 'doGet', 'doPost']);
const TRIGGER_RE = /(?:newTrigger|forFunction)\(\s*(['"])(\w+)\1/g;

/** @returns {Set<string>} Platform handler names plus every function the texts wire via ScriptApp.newTrigger/forFunction. */
export function triggerHandlers(...texts) {
  const out = new Set(PLATFORM_HANDLERS);
  for (const t of texts) for (const m of t.matchAll(TRIGGER_RE)) out.add(m[2]);
  return out;
}

/** @returns {string[]} Top-level functions of Code.gs text that take parameters and delegate to `_<name>Internal`, minus trigger handlers. */
export function findRpcEntries(codeText, handlers = triggerHandlers(codeText)) {
  const ast = parse(codeText, 'Code.gs');
  return ast.body
    .filter((n) => n.type === 'FunctionDeclaration' && !handlers.has(n.id.name) && n.params.length > 0 && codeText.slice(n.start, n.end).includes(`_${n.id.name}Internal`))
    .map((n) => n.id.name);
}

/** @returns {Map<string, object>} RPC name to the implementation function node assigned to `_<name>Internal` in this file. */
export function findImplementations(text, label = 'gas file') {
  const ast = parse(text, label);
  const topLevel = new Set(ast.body);
  const nested = new Map();
  const top = new Map();
  const aliases = [];
  walk(ast, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id) (topLevel.has(n) ? top : nested).set(n.id.name, n);
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed
      && INTERNAL_RE.test(n.left.property.name) && n.right.type === 'Identifier') {
      aliases.push([n.left.property.name.match(INTERNAL_RE)[1], n.right.name]);
    }
  });
  const out = new Map();
  for (const [rpc, implName] of aliases) {
    // The top-level delegator shares the name of the IIFE-private implementation; prefer the private one.
    const fn = nested.get(implName) || top.get(implName);
    if (fn) out.set(rpc, fn);
  }
  return out;
}

function chainHasV(node) {
  if (node.type === 'Identifier') return node.name === 'v_';
  if (node.type === 'MemberExpression') return (!node.computed && node.property.name === 'v_') || chainHasV(node.object);
  if (node.type === 'CallExpression') return chainHasV(node.callee);
  return false;
}

/** @returns {boolean} The function's first real statement calls `v_.guard(` or `v_.fn(` somewhere in its expression. */
export function isGuarded(fnNode) {
  const first = fnNode.body.body.find((s) => !(s.type === 'ExpressionStatement' && s.directive));
  if (!first) return false;
  let found = false;
  walk(first, (n) => {
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed
      && (n.callee.property.name === 'guard' || n.callee.property.name === 'fn') && chainHasV(n.callee.object)) found = true;
  });
  return found;
}

/** @returns {string[]} Sorted RPC names whose implementation is not v_-guarded (or cannot be found: fail closed). */
export function unguardedRpc(codeText, otherTexts) {
  const impls = findImplementations(codeText, 'Code.gs');
  otherTexts.forEach((t, i) => {
    for (const [name, fn] of findImplementations(t, `gas file #${i}`)) if (!impls.has(name)) impls.set(name, fn);
  });
  return findRpcEntries(codeText, triggerHandlers(codeText, ...otherTexts))
    .filter((name) => !impls.has(name) || !isGuarded(impls.get(name)))
    .sort();
}

/** @returns {{added: string[], stale: string[]}} Unguarded names missing from the baseline, and baseline names no longer unguarded. */
export function compare(unguarded, baseline) {
  return {
    added: unguarded.filter((n) => !baseline.includes(n)).sort(),
    stale: baseline.filter((n) => !unguarded.includes(n)).sort(),
  };
}

/**
 * Checks Code.gs against the baseline. A missing baseline is seeded once. With `update`, an
 * existing baseline only loses names; it never admits a new one.
 */
export function runCheck({ root, baselineFile, update = false, log = console.log }) {
  const gasDir = path.join(root, 'gas-app');
  const code = fs.readFileSync(path.join(gasDir, 'Code.gs'), 'utf8');
  const others = fs.readdirSync(gasDir)
    .filter((f) => f.endsWith('.gs') && f !== 'Code.gs' && f !== 'Engines.gs')
    .map((f) => fs.readFileSync(path.join(gasDir, f), 'utf8'));
  const unguarded = unguardedRpc(code, others);
  if (!fs.existsSync(baselineFile)) {
    fs.writeFileSync(baselineFile, `${JSON.stringify(unguarded, null, 2)}\n`);
    log(`✅ ${path.basename(baselineFile)} seeded with ${unguarded.length} unguarded RPC entry points`);
    return { ok: true, added: [], stale: [] };
  }
  const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  const { added, stale } = compare(unguarded, baseline);
  if (update) {
    fs.writeFileSync(baselineFile, `${JSON.stringify(baseline.filter((n) => !stale.includes(n)), null, 2)}\n`);
    log(`✅ ${path.basename(baselineFile)} updated (removed ${stale.length}, names only ever leave)`);
    return { ok: true, added, stale };
  }
  if (added.length) {
    log(`❌ RPC entry points without a v_.guard/v_.fn first statement: ${added.join(', ')}`);
    return { ok: false, added, stale };
  }
  log(`✅ RPC guards: ${unguarded.length} unguarded (baseline ${baseline.length}), none new${stale.length ? `; ${stale.length} now guarded, run --update` : ''}`);
  return { ok: true, added, stale };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { ok } = runCheck({ root: ROOT, baselineFile: BASELINE_FILE, update: process.argv.includes('--update') });
    if (!ok) process.exit(1);
  } catch (err) {
    console.error('check-rpc-guards failed:', err.stack);
    process.exit(1);
  }
}
