#!/usr/bin/env node
// vendored: omarchy-tooling/vendor/tools/check-catch-logging.js sha256:e96d3ec2f5cd81de57f71fd33e1aa29c11940569c5df1210b822ef9d666edda0. Do not edit; change upstream, then tool-vendor --apply.
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

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Project config from package.json "omarchy.catchLogging" (so this vendored file is never edited):
 * { scanDirs: ["gas-app","src"], skipFiles: ["gas-app/Engines.gs"], stackLoggers: [],
 *   stackCheck: { enabled: false, exemptFiles: [], allowed: {"file:fn": "reason"}, sinkFunctions: [] } }
 */
export function loadConfig(projectRoot = defaultRoot) {
  const f = path.join(projectRoot, 'package.json');
  let cfg = {};
  if (fs.existsSync(f)) {
    try { cfg = JSON.parse(fs.readFileSync(f, 'utf8')).omarchy?.catchLogging ?? {}; } catch (err) {
      throw new Error(`malformed ${f}: ${err.message}`, { cause: err });
    }
  }
  const sc = cfg.stackCheck ?? {};
  return {
    scanDirs: cfg.scanDirs ?? ['gas-app', 'src'],
    skipFiles: cfg.skipFiles ?? [],
    stackLoggers: cfg.stackLoggers ?? [],
    stackCheck: { enabled: sc.enabled ?? false, exemptFiles: sc.exemptFiles ?? [], allowed: sc.allowed ?? {}, sinkFunctions: sc.sinkFunctions ?? [] }
  };
}
const CONFIG = loadConfig();

/** Loggers known to console.error the stack of the error passed to them (plus config stackLoggers). */
export const STACK_LOGGERS = new Set(['logError', 'failFrom_', 'logSafe_', 'logSafe', 'logClientError', ...CONFIG.stackLoggers]);

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

/** Functions that sink a stack into logs: the stack loggers plus config stackCheck.sinkFunctions. */
export const STACK_SINK_FUNCTIONS = new Set([...STACK_LOGGERS, ...CONFIG.stackCheck.sinkFunctions]);

/** Files whose stacks are dev self-test output, never end-user UI (config stackCheck.exemptFiles). */
const STACK_EXEMPT_FILES = new Set(CONFIG.stackCheck.exemptFiles);

/** `file:enclosing-function` sites allowed to expose a stack, each with its reason (config stackCheck.allowed). */
export const STACK_TO_UI_ALLOWED = new Map(Object.entries(CONFIG.stackCheck.allowed));

function isConsoleCall(callee) {
  return callee.type === 'MemberExpression' && callee.object.type === 'Identifier' &&
    callee.object.name === 'console' && !callee.computed &&
    ['error', 'warn', 'log', 'info'].includes(callee.property.name);
}

/** Name of a function node: declaration id, or the variable/property it is assigned to. */
function functionName(fn, parent) {
  if (fn.id) return fn.id.name;
  if (parent && parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
  if (parent && parent.type === 'AssignmentExpression' && parent.left.type === 'Identifier') return parent.left.name;
  if (parent && (parent.type === 'Property' || parent.type === 'MethodDefinition') && !parent.computed && parent.key.name) return parent.key.name;
  return null;
}

/**
 * Flags every `.stack` read that is not inside a console.* / stack-logger call's arguments, a
 * stack-sink function body, an exempt file, or an allowlisted file:function. A stack in a returned
 * payload or UI text would reach end users (fail-loud-catch.md: end users see err.message only).
 * @returns {Array<{line:number, reason:string}>}
 */
export function checkStackSource(text, { sourceType = 'script', lineOffset = 0, file = '' } = {}) {
  if (STACK_EXEMPT_FILES.has(file)) return [];
  const ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType, locations: true, allowHashBang: true });
  const out = [];
  const visit = (node, ancestors) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'MemberExpression' && !node.computed && node.property.name === 'stack') {
      let allowed = false;
      let enclosing = null;
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const a = ancestors[i];
        if (a.type === 'CallExpression' && (isConsoleCall(a.callee) || STACK_LOGGERS.has(calleeName(a.callee)))) allowed = true;
        if (FUNCTION_TYPES.has(a.type)) {
          const name = functionName(a, ancestors[i - 1]);
          if (name && STACK_SINK_FUNCTIONS.has(name)) allowed = true;
          if (name && !enclosing) enclosing = name;
        }
      }
      if (!allowed && !STACK_TO_UI_ALLOWED.has(`${file}:${enclosing}`)) {
        out.push({ line: node.loc.start.line + lineOffset, reason: `.stack outside console.*/stack-logger args (${enclosing || 'top level'}); stacks must not reach UI or return payloads` });
      }
    }
    const next = [...ancestors, node];
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach((c) => visit(c, next));
      else if (v && typeof v.type === 'string') visit(v, next);
    }
  };
  visit(ast, []);
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

function listFiles(root, cfg) {
  const files = [];
  const walkDir = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (cfg.skipFiles.includes(rel)) continue;
      if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'node_modules') walkDir(rel); } else if (e.isFile()) {
        if (e.name.endsWith('.gs')) files.push({ rel, kind: 'gs' });
        else if (e.name.endsWith('.html')) files.push({ rel, kind: 'html' });
        else if (e.name.endsWith('.js')) files.push({ rel, kind: 'module' });
      }
    }
  };
  for (const d of cfg.scanDirs) if (fs.existsSync(path.join(root, d))) walkDir(d);
  return files;
}

export function run(projectRoot = defaultRoot) {
  const cfg = projectRoot === defaultRoot ? CONFIG : loadConfig(projectRoot);
  const root = projectRoot;
  const violations = [];
  for (const { rel, kind } of listFiles(root, cfg)) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    const sourceType = kind === 'module' ? 'module' : 'script';
    const found = kind === 'html'
      ? htmlScripts(text).flatMap((b) => [
        ...checkSource(b.body, { lineOffset: b.lineOffset }),
        ...(cfg.stackCheck.enabled ? checkStackSource(b.body, { lineOffset: b.lineOffset, file: rel }) : [])
      ])
      : [...checkSource(text, { sourceType }), ...(cfg.stackCheck.enabled ? checkStackSource(text, { sourceType, file: rel }) : [])];
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
