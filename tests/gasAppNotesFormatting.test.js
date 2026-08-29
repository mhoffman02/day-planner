'use strict';

// Regression test for note-card list editing behavior. Prior to this fix, pressing Enter on a
// bullet/ordered-list line dropped straight to a plain-text line instead of continuing the list
// (and ordered items never auto-incremented); toggling a plain line to "ordered" always reset to
// "1." instead of inheriting the next number from a preceding ordered line; and there was no way
// to strip formatting back to plain text from the toolbar. Since src/app.js's note-editing logic
// lives inside an Alpine `.data()` component (methods rely on `this`, DOM elements, and
// `$nextTick`), it can't be exercised directly under Node's test runner -- same constraint as
// gas-app/Script.html's hand-duplicated inline copy (see .claude/rules/sync-src-and-gas-app.md).
// This is a static contract check against both files' raw source, mirroring the pattern used in
// tests/gasAppIndexedDbShape.test.js and tests/gasAppAlpineOrder.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const appJs = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
const scriptHtml = fs.readFileSync(path.join(__dirname, '../gas-app/Script.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../gas-app/Index.html'), 'utf8');

for (const [label, src] of [['src/app.js', appJs], ['gas-app/Script.html', scriptHtml]]) {
  test(`${label}: Enter on a list line continues the list on the new line`, () => {
    assert.ok(
      /const orderedMatch = \/\^\(\\d\+\)\\\.\\s\/\.exec\(before\)/.test(src),
      `${label}'s Enter-key handler must detect an ordered-list prefix on the line being split`
    );
    assert.ok(
      /after = `\$\{parseInt\(orderedMatch\[1\], 10\) \+ 1\}\. \$\{after\}`/.test(src),
      `${label}'s Enter-key handler must auto-increment the ordered-list number onto the new line`
    );
    assert.ok(
      /else if \(\/\^- \/\.test\(before\)\) \{\s*after = `- \$\{after\}`/.test(src),
      `${label}'s Enter-key handler must carry a bullet prefix onto the new line`
    );
  });

  test(`${label}: defines nextOrderedNumber() to inherit numbering from the preceding line`, () => {
    assert.ok(
      /nextOrderedNumber\(lines, idx\)/.test(src),
      `${label} must define nextOrderedNumber(lines, idx)`
    );
    assert.ok(
      /applyLineFormat[\s\S]*?formatType === 'ordered'[\s\S]*?this\.nextOrderedNumber\(lines, idx\)/.test(src),
      `${label}'s applyLineFormat must use nextOrderedNumber() instead of always resetting to "1."`
    );
  });

  test(`${label}: defines clearLineFormatting() and wires a 'clear' formatType`, () => {
    assert.ok(
      /clearLineFormatting\(text\)/.test(src),
      `${label} must define clearLineFormatting(text)`
    );
    assert.ok(
      /formatType === 'clear'/.test(src),
      `${label}'s applyLineFormat must handle formatType === 'clear'`
    );
    assert.ok(
      /formatType === 'clear'\) \{\s*indices\.forEach|formatType === 'clear'[^\n]*\{\s*$/m.test(src) ||
        /'color-default' \|\| formatType === 'clear'/.test(src),
      `${label}'s applyRangeFormat must include 'clear' in its per-line dispatch`
    );
  });
}

test("gas-app/Index.html has a 'Clear Formatting' toolbar button wired to applyCardFormat", () => {
  assert.ok(
    /applyCardFormat\(card, 'clear'\)/.test(indexHtml),
    "Index.html's note-card toolbar must include a button calling applyCardFormat(card, 'clear')"
  );
});
