// Gate for tools/check-html.js: Alpine templates are mapped to the static page they render before
// html-validate sees them, and findings may only fall below html-baseline.json, never rise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { alpineToStatic, countFindings, compareToBaseline, runCheck, hardRuleViolations } from '../tools/check-html.js';

test('a11y-relevant bindings become static attributes, others are dropped', () => {
  assert.equal(alpineToStatic('<a :href="u" :class="c">x</a>'), '<a href="x">x</a>');
  assert.equal(alpineToStatic('<button x-bind:aria-label="l" :disabled="d"></button>'), '<button aria-label="x"></button>');
  assert.equal(alpineToStatic('<input :id="i" :for="f">'), '<input>');
});

test('x-text and x-html elements get placeholder text, line count unchanged', () => {
  const src = '<h3 class="t" x-text="label"></h3>\n<p x-html="h">\n</p>';
  const out = alpineToStatic(src);
  assert.equal(out, '<h3 class="t" x-text="label">x</h3>\n<p x-html="h">x\n</p>');
  assert.equal(out.split('\n').length, src.split('\n').length);
});

test('a bound heading is not reported empty, a truly empty button is', async () => {
  const ok = await countFindings('<!doctype html><html lang="en"><head><title>t</title></head><body><h3 x-text="a"></h3></body></html>', 't.html');
  assert.equal(ok.counts['empty-heading'], undefined);
  const bad = await countFindings('<!doctype html><html lang="en"><head><title>t</title></head><body><button type="button"></button></body></html>', 't.html');
  assert.equal(bad.counts['text-content'], 1);
});

test('only a rise over the baseline fails', () => {
  const base = { 'a.html': { 'text-content': 2 } };
  assert.deepEqual(compareToBaseline('a.html', { 'text-content': 2 }, base), []);
  assert.deepEqual(compareToBaseline('a.html', { 'text-content': 1 }, base), []);
  assert.match(compareToBaseline('a.html', { 'text-content': 3, 'no-dup-id': 1 }, base).join('|'), /text-content 3 > baseline 2\|a\.html: no-dup-id 1 > baseline 0/);
});

test('runCheck: a rise fails, an update only lowers counts and never admits a new rule', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-html-'));
  const page = (body) => `<!DOCTYPE html><html lang="en"><head><title>t</title></head><body>${body}</body></html>`;
  const write = (body) => fs.writeFileSync(path.join(dir, 'p.html'), page(body));
  const baselineFile = path.join(dir, 'base.json');
  const readBase = () => JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  const opts = { root: dir, files: ['p.html'], baselineFile, log: () => {} };

  write('<button type="button"></button><button type="button"></button>');
  assert.equal((await runCheck({ ...opts, update: true })).ok, true);
  assert.deepEqual(readBase(), { 'p.html': { 'text-content': 2 } });
  assert.equal((await runCheck(opts)).ok, true);

  write('<button type="button"></button><h3></h3>');
  const res = await runCheck(opts);
  assert.equal(res.ok, false);
  assert.match(res.errors.join('|'), /empty-heading 1 > baseline 0/);

  await runCheck({ ...opts, update: true });
  assert.deepEqual(readBase(), { 'p.html': { 'text-content': 1 } });
  assert.equal((await runCheck(opts)).ok, false);
});

test('x-html only renders through a sanitizer or a string literal', () => {
  const ok = '<p x-html="evt.description ? formatEventDescription(evt.description) : \'No description\'"></p>\n<p x-html="renderCardLine(idx.summary, false)"></p>';
  assert.deepEqual(hardRuleViolations('a.html', ok), []);
  const bad = '<p>x</p>\n<p x-html="evt.description"></p>\n<p x-html="ok ? renderCardLine(a) : raw"></p>';
  assert.deepEqual(hardRuleViolations('a.html', bad), [
    'a.html:2: x-html="evt.description" must go through formatEventDescription/renderCardLine (escape at output)',
    'a.html:3: x-html="ok ? renderCardLine(a) : raw" must go through formatEventDescription/renderCardLine (escape at output)'
  ]);
});

test('a pill or circle border-radius fails; small radii pass (no-pills)', () => {
  assert.deepEqual(hardRuleViolations('s.css', '.a { border-radius: 6px; }\n.b { border-radius: 4px 4px 0 0; }'), []);
  assert.deepEqual(hardRuleViolations('s.css', '.a {\n  border-radius: 50%;\n}\n.b { border-radius: 999px; }\n.c { border-radius:100px }'), [
    's.css:2: border-radius 50% is a pill/circle (no-pills.md)',
    's.css:4: border-radius 999px is a pill/circle (no-pills.md)',
    's.css:5: border-radius 100px is a pill/circle (no-pills.md)'
  ]);
});

test('x-text on a button whose other attribute contains > still gets placeholder text', () => {
  const src = '<button x-show="a > 3"\n  x-text="b"></button>';
  assert.equal(alpineToStatic(src), '<button x-show="a > 3"\n  x-text="b">x</button>');
});

test('fixed rules stay at zero in both page shells', async () => {
  for (const file of ['index.html', 'gas-app/Index.html']) {
    const { counts } = await countFindings(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), file);
    for (const rule of ['text-content', 'element-permitted-content', 'no-raw-characters', 'no-redundant-for']) {
      assert.equal(counts[rule], undefined, file + ': ' + rule);
    }
    assert.ok((counts['aria-label-misuse'] || 0) <= 1, file + ': aria-label-misuse');
    assert.ok((counts['prefer-native-element'] || 0) <= (file === 'index.html' ? 10 : 9), file + ': prefer-native-element');
  }
});
