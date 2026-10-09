#!/usr/bin/env node
// @file Fail-loud gate for every catch block (.agents/rules/fail-loud-catch.md).
// Each catch in gas-app/*.gs, gas-app/*.html <script> blocks and src/**/*.js must:
//   1. bind the error (no bare `catch {}`), AND
//   2. either rethrow (a `throw` directly in the catch body), or
//      log the stack: console.error(..., <err>.stack, ...) or an approved logger called with <err>.
// Nested functions inside the catch body do not count (they may never run).
// gas-app/Engines.gs is generated from src/integration, so it is checked at the source.
//
// Usage: node tools/check-catch-logging.js   (exit 1 and list file:line for every violation)

import * as acorn from 'acorn';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Loggers known to console.error the stack of the error passed to them. */
export const STACK_LOGGERS = new Set(['logError', 'failFrom_', 'logSafe_', 'logSafe', 'logClientError']);

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function walk(node, visit, skipFunctions) {
  if (!node || typeof node.type !== 'string') return;
  if (skipFunctions && FUNCTION_TYPES.has(node.type)) return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => walk(c, visit, skipFunctions));
    else if (v && typeof v.type === 'string') walk(v, visit, skipFunctions);
  }
}

function mentionsStack(node, name) {
  let hit = false;
  walk(node, (n) => {
    if (n.type === 'MemberExpression' && n.object.type === 'Identifier' && n.object.name === name &&
        !n.computed && n.property.name === 'stack') hit = true;
  }, false);
  return hit;
}

function calleeName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && !callee.computed) return callee.property.name;
  return '';
}

function isConsoleError(callee) {
  return callee.type === 'MemberExpression' && callee.object.type === 'Identifier' &&
    callee.object.name === 'console' && !callee.computed && callee.property.name === 'error';
}

/** @returns {string|null} violation reason, or null when the catch is compliant. */
export function checkCatch(clause) {
  if (!clause.param) return 'bare catch (no error binding)';
  if (clause.param.type !== 'Identifier') return 'destructured catch binding';
  const name = clause.param.name;
  let ok = false;
  for (const stmt of clause.body.body) {
    walk(stmt, (n) => {
      if (n.type === 'ThrowStatement') ok = true;
      if (n.type !== 'CallExpression') return;
      if (isConsoleError(n.callee) && n.arguments.some((a) => mentionsStack(a, name))) ok = true;
      if (STACK_LOGGERS.has(calleeName(n.callee)) &&
          n.arguments.some((a) => a.type === 'Identifier' && a.name === name)) ok = true;
    }, true);
  }
  return ok ? null : `catch (${name}) neither rethrows nor console.error(...${name}.stack) / ${[...STACK_LOGGERS].join('|')}(${name})`;
}

/** @returns {Array<{line:number, reason:string}>} */
export function checkSource(text, { sourceType = 'script', lineOffset = 0 } = {}) {
  const ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType, locations: true, allowHashBang: true });
  const out = [];
  walk(ast, (n) => {
    if (n.type === 'CatchClause') {
      const reason = checkCatch(n);
      if (reason) out.push({ line: n.loc.start.line + lineOffset, reason });
    }
  }, false);
  return out;
}

/** Inline <script> bodies of an HtmlService file; GAS scriptlets are blanked to keep offsets. */
export function htmlScripts(html) {
  const blocks = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const body = m[1].replace(/<\?[\s\S]*?\?>/g, (s) => s.replace(/[^\n]/g, ' ').replace(/^ {2}/, '0;'));
    if (!body.trim()) continue;
    const lineOffset = html.slice(0, m.index + m[0].indexOf(m[1])).split('\n').length - 1;
    blocks.push({ body, lineOffset });
  }
  return blocks;
}

function listFiles() {
  const files = [];
  for (const f of fs.readdirSync(path.join(root, 'gas-app'))) {
    if (f.endsWith('.gs') && f !== 'Engines.gs') files.push({ rel: `gas-app/${f}`, kind: 'gs' });
    if (f.endsWith('.html')) files.push({ rel: `gas-app/${f}`, kind: 'html' });
  }
  const walkDir = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory() && e.name !== 'vendor') walkDir(rel);
      else if (e.isFile() && e.name.endsWith('.js')) files.push({ rel, kind: 'module' });
    }
  };
  walkDir('src');
  return files;
}

export function run() {
  const violations = [];
  for (const { rel, kind } of listFiles()) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    const found = kind === 'html'
      ? htmlScripts(text).flatMap((b) => checkSource(b.body, { lineOffset: b.lineOffset }))
      : checkSource(text, { sourceType: kind === 'module' ? 'module' : 'script' });
    found.forEach((v) => violations.push(`${rel}:${v.line}: ${v.reason}`));
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = run();
  if (violations.length) {
    console.error(violations.join('\n'));
    console.error(`\n❌ ${violations.length} catch block(s) fail silently. Rethrow, or console.error the stack.`);
    process.exit(1);
  }
  console.log('✅ every catch block rethrows or logs its stack.');
}
