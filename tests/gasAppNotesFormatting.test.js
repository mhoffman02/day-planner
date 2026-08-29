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

  // Regression: nextOrderedNumber() originally only ever looked at lines[idx - 1], so a numbered
  // list separated from a newly-added line by a blank spacer line (a common shape once a note
  // has paragraph breaks) always restarted the count at 1 instead of continuing the list --
  // Docs/Word both continue numbering across a blank line. Fix: scan backward past blank lines
  // to find the nearest actual ordered-list item.
  test(`${label}: nextOrderedNumber() skips blank spacer lines when looking backward`, () => {
    assert.ok(
      /nextOrderedNumber\(lines, idx\) \{\s*for \(let i = idx - 1; i >= 0; i--\) \{/.test(src),
      `${label}'s nextOrderedNumber must scan backward from idx - 1 instead of only checking ` +
        'the single immediately-preceding line'
    );
    assert.ok(
      /if \(line\.trim\(\) === ''\) continue;/.test(src),
      `${label}'s nextOrderedNumber must skip blank lines while scanning backward for the ` +
        'nearest ordered-list item'
    );
  });

  // Regression: applyRangeFormat's 'ordered' branch used to blindly toggle every line in the
  // selected range via applyLineFormat, in index order. Selecting an existing numbered item plus
  // a newly-added plain line below it and clicking "Ordered" would strip the existing item's
  // number first (since it looked already-ordered and got toggled off), so by the time the loop
  // reached the new line, nextOrderedNumber read the just-stripped previous line and reset the
  // new line's number to 1 -- instead of continuing the list, formatting one clobbered the other.
  test(`${label}: applyRangeFormat only un-numbers a range's ordered lines when ALL are already ordered`, () => {
    assert.ok(
      /if \(formatType === 'bullet' \|\| formatType === 'color-default' \|\| formatType === 'clear'\) \{/.test(src),
      `${label}'s applyRangeFormat must no longer lump 'ordered' into the naive per-line toggle ` +
        "branch shared with 'bullet'"
    );
    assert.ok(
      /if \(formatType === 'ordered'\) \{[\s\S]*?const allOrdered = indices\.every/.test(src),
      `${label}'s applyRangeFormat must give 'ordered' its own branch that checks whether the ` +
        'whole range is already ordered before deciding to toggle'
    );
    assert.ok(
      /if \(allOrdered \|\| !alreadyOrdered\) this\.applyLineFormat\(card, i, 'ordered'\);/.test(src),
      `${label}'s applyRangeFormat must only apply 'ordered' to a line when the whole range is ` +
        'already ordered (toggle off) or that specific line is not yet ordered -- never re-toggle ' +
        'an already-ordered line inside a mixed range'
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

  // Regression: applyCardFormat used to require `_activeLineIndex == null` alongside a
  // `_selectedLineRange` before dispatching to applyRangeFormat. Since the line that anchored
  // the range only clears _activeLineIndex on an async blur, a range built by shift+click could
  // still see a stale _activeLineIndex set, silently routing "Clear Formatting" (and every other
  // toolbar button) to just the single anchor line instead of the whole selected range.
  test(`${label}: applyCardFormat prioritizes a selected range over a stray _activeLineIndex`, () => {
    assert.ok(
      /if \(card\._selectedLineRange\) \{\s*this\.applyRangeFormat\(card, formatType\);/.test(src),
      `${label}'s applyCardFormat must dispatch to applyRangeFormat whenever _selectedLineRange ` +
        'is set, regardless of _activeLineIndex'
    );
  });

  // Regression: renderCardLine rendered every ordered-list line as its own isolated single-item
  // <ol>, discarding the real stored number and relying on the browser's native <li> counter --
  // which restarts at 1 for every independent <ol>. Every ordered line displayed "1." once
  // rendered (only the raw "N. " text of the single line actively being edited ever showed the
  // real number), which read as the list numbering "breaking" after a couple of items.
  test(`${label}: renderCardLine pins the real ordered-list number via <li value>`, () => {
    assert.ok(
      /<li value="\$\{num\}">/.test(src),
      `${label}'s renderCardLine must render ordered-list items with an explicit <li value="N"> ` +
        "so each line's isolated <ol> shows its real stored number instead of always \"1.\""
    );
  });

  // Enhancement: pressing Enter on a list line that is nothing but the "- "/"N. " marker (no
  // text typed yet) should exit list mode for that line instead of continuing the list --
  // matching Google Docs/most editors' handling of an empty list item.
  test(`${label}: Enter on a blank list-marker-only line exits list mode`, () => {
    assert.ok(
      /if \(\/\^\(\\d\+\\\.\\s\|- \)\$\/\.test\(text\)\) \{/.test(src),
      `${label}'s Enter-key handler must detect a line whose entire content is just a bare list ` +
        'marker and revert it to plain text instead of carrying the marker to a new line'
    );
  });
}

test("gas-app/Index.html has a 'Clear Formatting' toolbar button wired to applyCardFormat", () => {
  assert.ok(
    /applyCardFormat\(card, 'clear'\)/.test(indexHtml),
    "Index.html's note-card toolbar must include a button calling applyCardFormat(card, 'clear')"
  );
});
