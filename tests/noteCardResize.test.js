/**
 * @file noteCardResize.test.js
 * @description Note cards get a textarea-style drag handle in both directions and a horizontal scrollbar only when the
 * lines are wider than the box (user 2026-11-18). The 280px cap applies only until the user drags: Chrome writes an
 * inline height on resize, and a capped box could not grow. The size is not stored, so a reload resets it. Checked in
 * both stylesheet copies.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const rule = (css, selector) => {
  const at = css.indexOf(`\n  ${selector} {`);
  assert.ok(at >= 0, `rule ${selector} exists`);
  return css.slice(at, css.indexOf('}', at));
};

for (const file of ['src/styles.css', 'gas-app/Styles.html']) {
  test(`${file}: note card lines resize in both directions and scroll sideways only on overflow`, () => {
    const css = read(file);
    const body = rule(css, '.note-card-lines');
    assert.match(body, /resize:\s*both;/);
    assert.match(body, /overflow:\s*auto;/);
    assert.match(body, /max-width:\s*100%;/);
    assert.doesNotMatch(body, /overflow-x:\s*scroll/);
  });

  test(`${file}: the height cap lifts once the user has dragged the handle`, () => {
    const css = read(file);
    assert.match(rule(css, '.note-card-lines:not([style*="height"])'), /max-height:\s*280px;/);
    assert.doesNotMatch(rule(css, '.note-card-lines'), /max-height/);
  });
}

test('the resized size is not stored anywhere', () => {
  for (const file of ['src/app.js', 'gas-app/Script.html']) {
    assert.doesNotMatch(read(file), /noteCardSize|note-card-size|cardResize/i, file);
  }
});
