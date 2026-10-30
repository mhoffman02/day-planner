// Gate for tools/check-rpc-guards.js: every Code.gs RPC entry point (a top-level delegator with
// parameters) must have an implementation that validates its args through v_, or be in
// rpc-guard-baseline.json. The baseline only shrinks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as acorn from 'acorn';
import { findRpcEntries, findImplementations, isGuarded, unguardedRpc, compare, runCheck } from '../tools/check-rpc-guards.js';

const fnNode = (src) => acorn.parse(src, { ecmaVersion: 'latest' }).body[0];

const CODE = `
(function (global) {
function addThing(a, b) { return a + b; }
function ping() { return 1; }
function safeThing(x) { v_.guard(arguments, 'safeThing').string('x').done(); return x; }
global._addThingInternal = addThing;
global._pingInternal = ping;
global._safeThingInternal = safeThing;
})(this);
function addThing(a, b) {
  return (typeof _addThingInternal === 'function') ? _addThingInternal(a, b) : null;
}
function ping() {
  return (typeof _pingInternal === 'function') ? _pingInternal() : null;
}
function safeThing(x) {
  return (typeof _safeThingInternal === 'function') ? _safeThingInternal(x) : null;
}
`;

test('findRpcEntries returns only top-level delegators that take parameters', () => {
  assert.deepEqual(findRpcEntries(CODE), ['addThing', 'safeThing']);
});

test('isGuarded accepts a v_.guard / v_.fn first statement (also DPEngines.v_) and rejects others', () => {
  assert.equal(isGuarded(fnNode("function f(a) { v_.guard(arguments, 'f').string('a').done(); }")), true);
  assert.equal(isGuarded(fnNode("function f(a) { DPEngines.v_.guard(arguments, 'f').string('a').done(); }")), true);
  assert.equal(isGuarded(fnNode("function f(a) { const args = v_.fn('f').string('a').done(); }")), true);
  assert.equal(isGuarded(fnNode("function f(a) { 'use strict'; v_.guard(arguments, 'f').done(); }")), true);
  assert.equal(isGuarded(fnNode('function f(a) { return a; }')), false);
  assert.equal(isGuarded(fnNode("function f(a) { log(a); v_.guard(arguments, 'f').done(); }")), false);
  assert.equal(isGuarded(fnNode('function f(a) {}')), false);
});

test('findImplementations maps the _xInternal alias to the function inside the IIFE, not the delegator', () => {
  const impls = findImplementations(CODE);
  assert.equal(isGuarded(impls.get('addThing')), false);
  assert.equal(isGuarded(impls.get('safeThing')), true);
});

test('unguardedRpc lists unguarded entries, and an entry with no implementation counts as unguarded', () => {
  assert.deepEqual(unguardedRpc(CODE, []), ['addThing']);
  const orphan = `${CODE}\nfunction orphan(q) { return _orphanInternal(q); }`;
  assert.deepEqual(unguardedRpc(orphan, []), ['addThing', 'orphan']);
});

test('implementations in other files are found', () => {
  const code = 'function remote(a) { return _remoteInternal(a); }';
  const other = "function remote(a) { v_.guard(arguments, 'remote').done(); }\nglobal._remoteInternal = remote;";
  assert.deepEqual(unguardedRpc(code, [other]), []);
});

test('a parse error is loud', () => {
  assert.throws(() => findRpcEntries('function ('), /Unexpected/);
});

test('compare: only an unguarded name missing from the baseline fails; stale entries are reported', () => {
  assert.deepEqual(compare(['a', 'b'], ['a', 'b', 'c']), { added: [], stale: ['c'] });
  assert.deepEqual(compare(['a', 'z'], ['a']), { added: ['z'], stale: [] });
});

test('runCheck: seeds once, fails on a new unguarded RPC, update only removes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-rpc-'));
  fs.mkdirSync(path.join(dir, 'gas-app'));
  const baselineFile = path.join(dir, 'b.json');
  const logs = [];
  const log = (m) => logs.push(m);
  const write = (code) => fs.writeFileSync(path.join(dir, 'gas-app', 'Code.gs'), code);
  write(CODE);
  assert.equal(runCheck({ root: dir, baselineFile, log }).ok, true);
  assert.match(logs.join('\n'), /seeded/);
  assert.deepEqual(JSON.parse(fs.readFileSync(baselineFile, 'utf8')), ['addThing']);

  write(`${CODE}\nfunction fresh(z) { return _freshInternal(z); }\n(function(global){ function fresh(z){return z;} global._freshInternal = fresh; })(this);`);
  const bad = runCheck({ root: dir, baselineFile, log });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.added, ['fresh']);
  runCheck({ root: dir, baselineFile, update: true, log });
  assert.deepEqual(JSON.parse(fs.readFileSync(baselineFile, 'utf8')), ['addThing'], 'update never adds');

  write(CODE.replace('function addThing(a, b) { return a + b; }', "function addThing(a, b) { v_.guard(arguments, 'a').done(); }"));
  assert.equal(runCheck({ root: dir, baselineFile, update: true, log }).ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(baselineFile, 'utf8')), []);
});
