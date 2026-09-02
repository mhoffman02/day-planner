'use strict';

// Regression coverage for a narrow-column overflow bug: .gchat-toolbar (the note card's
// rich-formatting toolbar -- clear/bold/italic/underline/strike, bullet/numbered list, four
// color swatches, and a typing-shortcuts help icon) had no flex-wrap, so once its column
// narrowed past the toolbar's natural width the trailing icons (color swatches, keyboard
// help) got shoved past the card's right edge instead of dropping to a second line.
//
// That was first fixed with flex-wrap: wrap, but wrapping to a second row made narrow note
// cards too tall (compounding with the heading textarea's own wrap onto 2 lines). Replaced
// with flex-wrap: nowrap + overflow-x: auto instead: the toolbar stays a single fixed-height
// row and scrolls horizontally rather than either spilling past the card edge or growing the
// card's height.
//
// Static contract check against raw source, since Alpine .data() markup can't be exercised
// directly under Node's test runner (see tests/gasAppAddNoteCard.test.js for the same pattern).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const stylesHtml = fs.readFileSync(path.join(__dirname, '../gas-app/Styles.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');

for (const [label, css] of [['gas-app/Styles.html', stylesHtml], ['src/styles.css', stylesCss]]) {
  test(`${label}: .gchat-toolbar scrolls instead of wrapping or overflowing in a narrow column`, () => {
    const block = css.match(/\.gchat-toolbar\s*\{[^}]*\}/);
    assert.ok(block, `${label} must define a .gchat-toolbar rule`);
    assert.ok(
      /flex-wrap:\s*nowrap;/.test(block[0]),
      `${label}'s .gchat-toolbar must set flex-wrap: nowrap so it stays a single row instead of ` +
        `growing the card's height when the column narrows`
    );
    assert.ok(
      /overflow-x:\s*auto;/.test(block[0]),
      `${label}'s .gchat-toolbar must set overflow-x: auto so format buttons and color swatches ` +
        `scroll horizontally instead of overflowing past the card's edge when the column narrows`
    );
  });
}
