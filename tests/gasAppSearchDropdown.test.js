'use strict';

// Regression coverage for the Universal Search redesign: it used to be a screen-centered
// <dialog class="modal-backdrop"> popup titled "Universal Search (Ctrl + K)" with a dark
// full-viewport backdrop and an explicit Close button. Per user request it's now a
// borderless dropdown panel anchored under the header search icon (no backdrop dimming --
// closes on click-away/Escape like a normal dropdown), titled "Global search".
//
// Static contract check against raw source, since Alpine .data() markup can't be exercised
// directly under Node's test runner (see tests/gasAppAddNoteCard.test.js for the same pattern).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const indexHtml = fs.readFileSync(path.join(__dirname, '../gas-app/Index.html'), 'utf8');
const stylesHtml = fs.readFileSync(path.join(__dirname, '../gas-app/Styles.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
const scriptHtml = fs.readFileSync(path.join(__dirname, '../gas-app/Script.html'), 'utf8');

test('gas-app/Index.html: search panel is titled "Global search", not the old "Universal Search" wording', () => {
  assert.ok(
    /class="search-dropdown-title">[\s\S]*?Global search/.test(indexHtml),
    'the search panel heading must read "Global search"'
  );
  assert.ok(
    !/Universal Search/.test(indexHtml),
    'the old "Universal Search" wording must not remain anywhere in the markup'
  );
});

test('gas-app/Index.html: search trigger button opens an anchored dropdown, not a centered modal dialog', () => {
  assert.ok(
    /class="search-dropdown-wrap">[\s\S]*?class="search-trigger-compact"/.test(indexHtml),
    'the search-trigger-compact button must sit inside a .search-dropdown-wrap so the panel can anchor to it'
  );
  assert.ok(
    /class="search-dropdown-panel"[^>]*x-show="searchModalOpen"/.test(indexHtml),
    'the search panel must be a plain .search-dropdown-panel div toggled by x-show, not a <dialog>'
  );
  assert.ok(
    !/<dialog[^>]*>[\s\S]{0,400}search-trigger-compact/.test(indexHtml.replace(/[\s\S]*header-actions-compact/, '')),
    'the search dropdown must not be wrapped in a <dialog class="modal-backdrop"> element'
  );
});

test('gas-app/Index.html: search dropdown closes on click-away and Escape, with no explicit Close button', () => {
  assert.ok(
    /class="search-dropdown-panel"[^>]*@click\.away="closeSearchModal\(\)"/.test(indexHtml),
    'the search panel must close on click-away'
  );
  assert.ok(
    /class="search-dropdown-panel"[^>]*@keydown\.escape\.window="closeSearchModal\(\)"/.test(indexHtml),
    'the search panel must close on Escape'
  );
});

for (const [label, css] of [['gas-app/Styles.html', stylesHtml], ['src/styles.css', stylesCss]]) {
  test(`${label}: .search-dropdown-panel is anchored under the icon, not a full-viewport backdrop`, () => {
    assert.ok(
      /\.search-dropdown-wrap\s*\{[^}]*position:\s*relative;/.test(css),
      `${label}'s .search-dropdown-wrap must be position: relative so the panel can anchor to it`
    );
    assert.ok(
      /\.search-dropdown-panel\s*\{[^}]*position:\s*absolute;/.test(css),
      `${label}'s .search-dropdown-panel must be position: absolute (anchored dropdown), not a fixed full-viewport modal`
    );
  });
}

for (const [label, src] of [['src/app.js', appJs], ['gas-app/Script.html', scriptHtml]]) {
  test(`${label}: toggleSearchModal() focuses the search input on open`, () => {
    assert.ok(
      /toggleSearchModal\(\) \{[\s\S]*?this\.runSearch\(\);[\s\S]*?\.search-input-field[\s\S]*?\.focus\(\);[\s\S]*?\},/.test(src),
      `${label}'s toggleSearchModal() must focus .search-input-field after opening, since the dropdown ` +
        `has no autofocus dialog semantics of its own`
    );
  });
}
