import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function rule(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `rule not found: ${selector}`);
  return css.slice(start, css.indexOf('}', start));
}

test('binder fills the viewport: no max-width cap on .binder-container', () => {
  assert.doesNotMatch(rule('  .binder-container'), /max-width:\s*\d+px/);
});
test('body gutter is 8px each side', () => {
  assert.match(rule('  body'), /padding:\s*52px 8px 4px 8px/);
});
test('prose pages keep a reading-width cap', () => {
  assert.match(rule('  article.about-container'), /max-width:\s*960px/);
});
