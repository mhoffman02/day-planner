'use strict';

// Regression test for the "New Card" note-card stub. Previously addNoteCard() seeded
// card.heading with the literal, non-empty string '#index [Topic] New Card', and
// .card-heading-input had zero hover/focus affordance -- so a freshly-added card looked
// like a fixed, unstyled label rather than an editable field, and an un-edited card
// silently polluted the Monthly Index (its heading already matched #index [Topic]).
// Since addNoteCard() lives inside an Alpine `.data()` component, it can't be exercised
// directly under Node's test runner -- same constraint as gas-app/Script.html's
// hand-duplicated inline copy (see .claude/rules/sync-src-and-gas-app.md). This is a
// static contract check against both files' raw source, mirroring the pattern used in
// tests/gasAppNotesFormatting.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const appJs = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
const scriptHtml = fs.readFileSync(path.join(__dirname, '../gas-app/Script.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../gas-app/Index.html'), 'utf8');
const stylesHtml = fs.readFileSync(path.join(__dirname, '../gas-app/Styles.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');

for (const [label, src] of [['src/app.js', appJs], ['gas-app/Script.html', scriptHtml]]) {
  test(`${label}: addNoteCard() seeds an empty heading, not the literal stub text`, () => {
    assert.ok(
      /addNoteCard\(\) \{[\s\S]*?heading: '',/.test(src),
      `${label}'s addNoteCard() must seed heading: '' so the placeholder guides the user, ` +
        `instead of a literal '#index [Topic] New Card' string the user has to notice and overwrite`
    );
    assert.ok(
      !/heading: '#index \[Topic\] New Card'/.test(src),
      `${label} must not seed a new card's heading with the old literal stub text`
    );
  });

  test(`${label}: addNoteCard() focuses the new card's heading input`, () => {
    assert.ok(
      /addNoteCard\(\) \{[\s\S]*?this\.focusNoteCardHeading\(newCard\.id\);/.test(src),
      `${label}'s addNoteCard() must call focusNoteCardHeading() so a new card is immediately ready to type into`
    );
    assert.ok(
      /focusNoteCardHeading\(cardId\) \{/.test(src),
      `${label} must define focusNoteCardHeading(cardId)`
    );
  });
}

test('gas-app/Index.html: card article carries data-card-id for focus targeting', () => {
  assert.ok(
    /:data-card-id="card\.id"/.test(indexHtml),
    'note-card-item article must expose :data-card-id="card.id" so focusNoteCardHeading() can find it'
  );
});

test('gas-app/Index.html: heading input has a hover-help tip explaining #index and its downstream effect', () => {
  assert.ok(
    /class="card-heading-help"/.test(indexHtml),
    'a .card-heading-help element must sit next to the heading input'
  );
  assert.ok(
    /class="card-heading-help-tip"[^>]*>[\s\S]*?#index \[Topic\] Summary[\s\S]*?Monthly Index/.test(indexHtml),
    'the hover-help tip must mention the #index [Topic] Summary format and that it feeds the Monthly Index'
  );
});

for (const [label, css] of [['gas-app/Styles.html', stylesHtml], ['src/styles.css', stylesCss]]) {
  test(`${label}: .card-heading-input has a visible hover/focus affordance`, () => {
    assert.ok(
      /\.card-heading-input:hover\s*\{[^}]*border-bottom-color/.test(css),
      `${label}'s .card-heading-input:hover must reveal a border so the field reads as editable`
    );
    assert.ok(
      /\.card-heading-input:focus\s*\{[^}]*border-bottom:\s*1px solid var\(--theme-primary\)/.test(css),
      `${label}'s .card-heading-input:focus must show a visible focus indicator`
    );
  });

  test(`${label}: defines .card-heading-help-tip hover/focus tooltip styling`, () => {
    assert.ok(
      /\.card-heading-help-tip\s*\{/.test(css),
      `${label} must style .card-heading-help-tip`
    );
    assert.ok(
      /\.card-heading-help:hover \.card-heading-help-tip,/.test(css),
      `${label} must reveal .card-heading-help-tip on :hover (and :focus-visible)`
    );
  });
}
