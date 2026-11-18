/**
 * @file noteCardResize.test.js
 * @description Note cards get a drag handle for height only (user 2026-11-18: sideways resize is not useful, the width
 * always fills the card) and a horizontal scrollbar only when the lines are wider than the box. The 280px cap applies
 * only until the user drags: Chrome writes an inline height on resize, and a capped box could not grow. The height is
 * not stored, so a reload resets it. Also pins the Email topic: no border, a mail icon before its title. Checked in
 * both stylesheet and page copies.
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
    assert.match(body, /resize:\s*vertical;/, 'user 2026-11-18: only height is useful; the width always fills the card');
    assert.match(body, /overflow:\s*auto;/);
    assert.doesNotMatch(body, /resize:\s*(both|horizontal)/);
    assert.doesNotMatch(body, /overflow-x:\s*scroll/);
  });

  test(`${file}: the Email topic has no border and its title starts with a mail icon`, () => {
    const css = read(file);
    assert.doesNotMatch(rule(css, '.email-topic'), /border/);
  });

  test(`${file}: the height cap lifts once the user has dragged the handle`, () => {
    const css = read(file);
    assert.match(rule(css, '.note-card-lines:not([style*="height"])'), /max-height:\s*280px;/);
    assert.doesNotMatch(rule(css, '.note-card-lines'), /max-height/);
  });
}

for (const file of ['index.html', 'gas-app/Index.html']) {
  test(`${file}: the Email topic title has a mail icon before the word Email`, () => {
    assert.match(read(file), /<summary class="email-topic-title"><span class="material-symbols-outlined icon-14" aria-hidden="true">mail<\/span>\s*Email \(/);
  });
}

test('the resized size is not stored anywhere', () => {
  for (const file of ['src/app.js', 'gas-app/Script.html']) {
    assert.doesNotMatch(read(file), /noteCardSize|note-card-size|cardResize/i, file);
  }
});
