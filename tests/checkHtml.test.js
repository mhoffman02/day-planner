// Gate for tools/check-html.js: Alpine templates are mapped to the static page they render before
// html-validate sees them, and findings may only fall below html-baseline.json, never rise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alpineToStatic, countFindings, compareToBaseline } from '../tools/check-html.js';

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
