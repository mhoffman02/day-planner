// Gate for tools/check-mirror.js: src/*.js and src/styles.css are hand-mirrored into
// gas-app/Script.html and gas-app/Styles.html. Names that differ today are ratcheted in
// mirror-baseline.json; a function or CSS rule that newly drifts fails, the baseline only shrinks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { functionVariants, cssRules, diffNames, runCheck } from '../tools/check-mirror.js';

const html = (js) => `<html><script>${js}</script></html>`;

test('functionVariants ignores whitespace, comments, export and var/let/const but not logic', () => {
  const a = functionVariants('export function f(x) {\n  // note\n  const y = x + 1; /* c */ return y;\n}', 'module');
  const b = functionVariants('function f(x){ var y = x+1; return y; }', 'script');
  assert.deepEqual([...a.get('f')], [...b.get('f')]);
  const c = functionVariants('function f(x){ var y = x+2; return y; }', 'script');
  assert.notDeepEqual([...a.get('f')], [...c.get('f')]);
});

test('functionVariants keys object and class methods as m:<name>', () => {
  const v = functionVariants('const o = { go(a) { return a; }, stop: function () { return 1; } };', 'script');
  assert.ok(v.has('m:go'));
  assert.ok(v.has('m:stop'));
});

test('cssRules keys rules by selector, nests @media, and comments/whitespace do not count', () => {
  const rules = cssRules('/* c */ .a { color: red; }\n@media (max-width: 600px) { .a { color:blue } }\n@import url("x.css");');
  assert.equal(rules.get('.a'), '.a{color:red}');
  assert.ok(rules.has('@media (max-width: 600px) > .a'));
  assert.ok([...rules.keys()].some((k) => k.startsWith('@import')));
});

test('diffNames: identical mirrors are empty; a changed body, a changed rule and a one-sided rule are named', () => {
  const src = { 'a.js': 'export function f(x) { return x; }\nexport function g() { return 1; }\nfunction onlySrc() {}' };
  const same = diffNames({ srcFiles: src, scriptHtml: html('function f(x){return x;}\nfunction g(){return 1;}'), srcCss: '.a{color:red}', gasCss: '<style>.a { color: red; }</style>' });
  assert.deepEqual(same, []);
  const drift = diffNames({ srcFiles: src, scriptHtml: html('function f(x){return x+1;}\nfunction g(){return 1;}'), srcCss: '.a{color:red}.b{top:0}', gasCss: '<style>.a { color: blue; }</style>' });
  assert.deepEqual(drift, ['a.js:f', 'styles.css:.a', 'styles.css:.b']);
});

test('diffNames: a Script.html parse error is loud', () => {
  assert.throws(() => diffNames({ srcFiles: {}, scriptHtml: html('function ('), srcCss: '', gasCss: '' }), /Unexpected/);
});

test('runCheck: seeds once, a new drift fails, update only removes entries that now match', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-mirror-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'gas-app'));
  const baselineFile = path.join(dir, 'b.json');
  const logs = [];
  const log = (m) => logs.push(m);
  const put = (rel, text) => fs.writeFileSync(path.join(dir, rel), text);
  const setup = (srcJs, gasJs) => {
    put('src/a.js', srcJs);
    put('src/gasBridge.js', 'export function mockOnly() { return 1; }');
    put('src/styles.css', '.a{color:red}');
    put('gas-app/Script.html', html(`${gasJs}\nfunction mockOnly(){return 2;}`));
    put('gas-app/Styles.html', '<style>.a{color:red}</style>');
  };
  setup('export function f() { return 1; }\nexport function g() { return 1; }', 'function f(){return 1;}\nfunction g(){return 2;}');
  assert.equal(runCheck({ root: dir, baselineFile, log }).ok, true);
  assert.match(logs.join('\n'), /seeded/);
  assert.deepEqual(JSON.parse(fs.readFileSync(baselineFile, 'utf8')), ['a.js:g']);

  setup('export function f() { return 1; }\nexport function g() { return 1; }', 'function f(){return 9;}\nfunction g(){return 2;}');
  const bad = runCheck({ root: dir, baselineFile, log });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.added, ['a.js:f']);
  runCheck({ root: dir, baselineFile, update: true, log });
  assert.deepEqual(JSON.parse(fs.readFileSync(baselineFile, 'utf8')), ['a.js:g'], 'update never adds');

  setup('export function f() { return 1; }\nexport function g() { return 1; }', 'function f(){return 1;}\nfunction g(){return 1;}');
  runCheck({ root: dir, baselineFile, update: true, log });
  assert.deepEqual(JSON.parse(fs.readFileSync(baselineFile, 'utf8')), []);
});
