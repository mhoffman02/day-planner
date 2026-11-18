/**
 * @file noteCardResize.test.js
 * @description Note cards get a drag handle for height only (user 2026-11-18: sideways resize is not useful, the width
 * always fills the card) and a horizontal scrollbar only when the lines are wider than the box. The 280px cap applies
 * only until the user drags: Chrome writes an inline height on resize, and a capped box could not grow. The height is
 * not stored, so a reload resets it. Also pins the Email card: the Quote card shell with a mail icon title and its own twistie. Checked in
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

  test(`${file}: the Email card lets its hover preview overflow the quote-card shell`, () => {
    const css = read(file);
    assert.match(rule(css, '.quote-card.email-card'), /overflow:\s*visible;/);
    assert.match(css, /\.email-card \.quote-card-header\s*\{[^}]*border-radius:\s*4px 4px 0 0;/);
  });

  test(`${file}: the height cap lifts once the user has dragged the handle`, () => {
    const css = read(file);
    assert.match(rule(css, '.note-card-lines:not([style*="height"])'), /max-height:\s*280px;/);
    assert.doesNotMatch(rule(css, '.note-card-lines'), /max-height/);
  });
}

for (const file of ['index.html', 'gas-app/Index.html']) {
  test(`${file}: the Email card is built like the Quote card (twistie header, uppercase title with a mail icon, body)`, () => {
    const html = read(file);
    const at = html.indexOf('<article class="quote-card email-card"');
    assert.ok(at >= 0, 'Email card uses the quote-card shell');
    const card = html.slice(at, html.indexOf('</article>', at));
    assert.match(card, /<header class="quote-card-header" @click="toggleEmailCard\(\)">/);
    assert.match(card, /class="card-twistie-btn"/);
    assert.match(card, /<span class="quote-card-title"><span class="material-symbols-outlined icon-14" aria-hidden="true">mail<\/span> Email \(/);
    assert.match(card, /<div class="quote-card-body" x-show="!emailCardCollapsed">/);
    assert.doesNotMatch(html, /<details class="email-topic"/);
  });
}

for (const file of ['src/app.js', 'gas-app/Script.html']) {
  test(`${file}: the Email card collapses with its own flag, open by default`, () => {
    const js = read(file);
    assert.match(js, /emailCardCollapsed: false,/);
    assert.match(js, /toggleEmailCard\(\) \{\s*this\.emailCardCollapsed = !this\.emailCardCollapsed;/);
  });
}

test('the resized size is not stored anywhere', () => {
  for (const file of ['src/app.js', 'gas-app/Script.html']) {
    assert.doesNotMatch(read(file), /noteCardSize|note-card-size|cardResize/i, file);
  }
});
