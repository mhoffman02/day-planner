// The 4 baseline axe violations (document-title, html-has-lang, landmark-one-main, page-has-heading-one)
// came from auditing Google's empty sandbox wrapper frame, not the app document inside #userHtmlFrame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAxeExpression } from '../tools/lib/axe-live.js';

test('axe expression audits the app document inside userHtmlFrame, not the wrapper', () => {
  const expr = buildAxeExpression('/*AXE*/');
  assert.match(expr, /userHtmlFrame/);
  assert.match(expr, /contentWindow/);
});

test('axe runs only the named Section 508 / WCAG 2.2 AA tag set', () => {
  const expr = buildAxeExpression('/*AXE*/');
  assert.match(expr, /runOnly/);
  for (const tag of ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'section508']) assert.ok(expr.includes(`"${tag}"`), tag);
});

for (const file of ['gas-app/Index.html', 'index.html']) {
  test(`${file} has lang, title, main landmark and an h1`, () => {
    const html = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, /<html lang="en"/);
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /<main[\s>]/);
    assert.match(html, /<h1[\s>]/);
  });
}
