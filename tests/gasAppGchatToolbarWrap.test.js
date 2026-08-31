'use strict';

// Regression coverage for a narrow-column overflow bug: .gchat-toolbar (the note card's
// rich-formatting toolbar -- clear/bold/italic/underline/strike, bullet/numbered list, four
// color swatches, and a typing-shortcuts help icon) had no flex-wrap, so once its column
// narrowed past the toolbar's natural width the trailing icons (color swatches, keyboard
// help) got shoved past the card's right edge instead of dropping to a second line. Fixed by
// adding flex-wrap: wrap (+ row-gap for the wrapped state) to both stylesheets.
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
  test(`${label}: .gchat-toolbar wraps instead of overflowing in a narrow column`, () => {
    assert.ok(
      /\.gchat-toolbar\s*\{[^}]*flex-wrap:\s*wrap;/.test(css),
      `${label}'s .gchat-toolbar must set flex-wrap: wrap so format buttons and color swatches ` +
        `drop to a second line instead of overflowing past the card's edge when the column narrows`
    );
  });
}
