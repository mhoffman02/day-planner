'use strict';

// Regression coverage for the note-card Topic/Summary redesign. Originally addNoteCard()
// seeded card.heading with the literal, non-empty string '#index [Topic] New Card' and
// .card-heading-input had zero hover/focus affordance -- a freshly-added card looked like a
// fixed, unstyled label rather than an editable field. That was fixed by seeding an empty
// heading with a placeholder + hover-help tip, but the tip text still showed users raw
// `#index [Topic] Summary` tag syntax to type by hand, which is clunky and error-prone.
//
// This second pass splits the single heading input into two fields: a Topic input (datalist
// autocomplete, blank by default -- blank means the card is local-only and never reaches the
// Monthly Index) and a Summary input (disabled until a Topic is set, since a summary is
// meaningless without a topic to file it under). The `#index [Topic] Summary` tag syntax is
// now purely an internal storage format, composed/decomposed by
// composeIndexHeading/decomposeIndexHeading -- the user never sees or types it.
//
// Since addNoteCard() and friends live inside an Alpine `.data()` component, they can't be
// exercised directly under Node's test runner -- same constraint as gas-app/Script.html's
// hand-duplicated inline copy (see .claude/rules/sync-src-and-gas-app.md). This is a static
// contract check against both files' raw source, mirroring the pattern used in
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
  test(`${label}: addNoteCard() seeds an empty Topic and heading, not literal stub text`, () => {
    assert.ok(
      /addNoteCard\(\) \{[\s\S]*?indexTopic: '',[\s\S]*?heading: '',/.test(src),
      `${label}'s addNoteCard() must seed indexTopic: '' and heading: '' so a new card starts ` +
        `local-only with an empty Summary, instead of a literal '#index [Topic] New Card' string`
    );
    assert.ok(
      !/heading: '#index \[Topic\] New Card'/.test(src),
      `${label} must not seed a new card's heading with the old literal stub text`
    );
  });

  test(`${label}: addNoteCard() focuses the new card's Topic input`, () => {
    assert.ok(
      /addNoteCard\(\) \{[\s\S]*?this\.focusNoteCardHeading\(newCard\.id\);/.test(src),
      `${label}'s addNoteCard() must call focusNoteCardHeading() so a new card is immediately ready to type into`
    );
    assert.ok(
      /focusNoteCardHeading\(cardId\) \{[\s\S]*?\.card-topic-input/.test(src),
      `${label}'s focusNoteCardHeading() must focus .card-topic-input -- Topic comes first since ` +
        `whether it's filled in decides if the card is private or indexed`
    );
  });

  test(`${label}: defines indexTopicOptions() for the Topic datalist's autocomplete`, () => {
    assert.ok(
      /indexTopicOptions\(\) \{/.test(src),
      `${label} must define indexTopicOptions() returning today's already-used Topic values`
    );
  });

  test(`${label}: decomposeIndexHeading() strips #index/[INDEX] tag syntax into structured fields`, () => {
    assert.ok(
      /decomposeIndexHeading\(headingClean\) \{/.test(src),
      `${label} must define decomposeIndexHeading() so legacy '#index [Topic] Summary' headings ` +
        `load into the Topic/Summary fields instead of showing raw tag syntax`
    );
    assert.ok(
      /parseDailyNoteToCards[\s\S]*?this\.decomposeIndexHeading\(headingClean\)/.test(src),
      `${label}'s parseDailyNoteToCards() must call decomposeIndexHeading() when building each card`
    );
  });

  test(`${label}: syncCardsToDailyNote() only emits #index tag syntax when a Topic is set`, () => {
    assert.ok(
      /c\.indexTopic\s*\?\s*`#index \[\$\{c\.indexTopic\}\] \$\{c\.heading \|\| 'Topic'\}`\s*:\s*\(c\.heading \|\| 'Topic'\)/.test(src),
      `${label}'s syncCardsToDailyNote() must compose '#index [Topic] Summary' only when ` +
        `c.indexTopic is set, and fall back to a plain (unindexed) heading line otherwise`
    );
  });
}

test('gas-app/Index.html: card article carries data-card-id for focus targeting', () => {
  assert.ok(
    /:data-card-id="card\.id"/.test(indexHtml),
    'note-card-item article must expose :data-card-id="card.id" so focusNoteCardHeading() can find it'
  );
});

test('gas-app/Index.html: renders separate Topic and Summary inputs, not raw tag syntax', () => {
  assert.ok(
    /class="card-topic-input"/.test(indexHtml),
    'a .card-topic-input must exist for the Topic field'
  );
  assert.ok(
    /x-model="card\.indexTopic"[\s\S]{0,40}list="index-topics-datalist"/.test(indexHtml),
    'the Topic input must bind to card.indexTopic and reference the shared datalist'
  );
  assert.ok(
    /<datalist id="index-topics-datalist">[\s\S]*?indexTopicOptions\(\)/.test(indexHtml),
    'an #index-topics-datalist populated from indexTopicOptions() must exist for Topic autocomplete'
  );
  assert.ok(
    /x-model="card\.heading"[\s\S]{0,60}:disabled="!card\.indexTopic"/.test(indexHtml),
    'the Summary input must bind to card.heading and be disabled while no Topic is set'
  );
});

test('gas-app/Index.html: heading help tip explains Topic vs Summary without showing raw tag syntax', () => {
  assert.ok(
    /class="card-heading-help"/.test(indexHtml),
    'a .card-heading-help element must sit next to the Topic/Summary inputs'
  );
  assert.ok(
    /class="card-heading-help-tip"[^>]*>[\s\S]*?Topic[\s\S]*?Monthly Index/.test(indexHtml),
    'the hover-help tip must explain that setting a Topic is what feeds the Monthly Index'
  );
  const headingHelpTips = indexHtml.match(/class="card-heading-help-tip"[^>]*>([\s\S]*?)<\/span>/g) || [];
  assert.ok(
    headingHelpTips.every((tip) => !/#index \[Topic\] Summary/.test(tip)),
    'no card-heading-help-tip should show raw #index [Topic] Summary tag syntax -- users edit ' +
      'structured Topic/Summary fields now, never the underlying tag format'
  );
});

test('gas-app/Index.html: formatting toolbar has a hover-help tip for markdown typing shortcuts', () => {
  assert.ok(
    /aria-label="Typing shortcuts for formatting"/.test(indexHtml),
    'the formatting toolbar must include a hover-help icon documenting typed shortcuts'
  );
  assert.ok(
    /card-heading-help-tip">Faster than the buttons:[\s\S]*?<code>- <\/code>[\s\S]*?<code>1\. <\/code>/.test(indexHtml),
    'the typing-shortcuts tip must mention "- " for bullets and "1. " for numbered lists'
  );
});

for (const [label, css] of [['gas-app/Styles.html', stylesHtml], ['src/styles.css', stylesCss]]) {
  test(`${label}: .card-heading-input has a visible hover/focus/disabled affordance`, () => {
    assert.ok(
      /\.card-heading-input:hover\s*\{[^}]*border-bottom-color/.test(css),
      `${label}'s .card-heading-input:hover must reveal a border so the field reads as editable`
    );
    assert.ok(
      /\.card-heading-input:focus\s*\{[^}]*border-bottom:\s*1px solid var\(--theme-primary\)/.test(css),
      `${label}'s .card-heading-input:focus must show a visible focus indicator`
    );
    assert.ok(
      /\.card-heading-input:disabled\s*\{[^}]*cursor:\s*not-allowed/.test(css),
      `${label}'s .card-heading-input:disabled must visibly read as non-interactive while no Topic is set`
    );
  });

  test(`${label}: .card-topic-input has its own hover/focus affordance`, () => {
    assert.ok(
      /\.card-topic-input\s*\{/.test(css),
      `${label} must style .card-topic-input`
    );
    assert.ok(
      /\.card-topic-input:hover\s*\{[^}]*border-bottom-color/.test(css),
      `${label}'s .card-topic-input:hover must reveal a border so the field reads as editable`
    );
    assert.ok(
      /\.card-topic-input:focus\s*\{[^}]*border-bottom:\s*1px solid var\(--theme-primary\)/.test(css),
      `${label}'s .card-topic-input:focus must show a visible focus indicator`
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
