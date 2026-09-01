'use strict';

// Regression coverage for two bugs in the Global Search "Index" result category:
//
// 1. Parsing bug in buildIndexRecords() (app.js/Script.html): #index tags composed as a note
//    card's heading (syncCardsToDailyNote()) are saved as "### #index [Topic] Summary" -- the
//    "### " markdown heading marker was never stripped before the [Topic] bracket was matched,
//    so the anchored `^\[...\]` regex failed, topic fell back to the literal 'General', and the
//    leftover "###" leaked into the summary (e.g. topic "General", summary
//    "### [FieldFLEX] UAT Status" instead of topic "FieldFLEX", summary "UAT Status").
//
// 2. Display format: the search result showed a bold "[Index]" category tag followed by
//    "Topic: Summary" in one plain-text span. Changed to bold just the Topic (no "[Index]" tag),
//    per user request: "FieldFLEX: UAT Status" with "FieldFLEX" bolded, not
//    "[Index] General: ### [FieldFLEX] UAT Status".
//
// Static contract check against raw source, since Alpine .data() markup/methods can't be
// exercised directly under Node's test runner (see tests/gasAppAddNoteCard.test.js for the
// same pattern).

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
  test(`${label}: buildIndexRecords() strips a leading markdown heading marker before matching the [Topic] bracket`, () => {
    assert.ok(
      /buildIndexRecords\(\) \{[\s\S]*?l\.replace\(\/\^#\+\\s\+\/, ''\)\.replace\(\/#index\|\\\[INDEX\\\]\/gi, ''\)/.test(src),
      `${label}'s buildIndexRecords() must strip a leading "#"/"##"/"###" heading marker before ` +
        `removing the #index/[INDEX] token, or a composed "### #index [Topic] Summary" heading ` +
        `line falls back to topic 'General' with a stray "###" leaking into the summary`
    );
  });
}

test('gas-app/Index.html: search dropdown bolds the Index result\'s Topic instead of showing an "[Index]" tag', () => {
  assert.ok(
    /result-index">\s*<b x-text="item\.topic"><\/b><span x-text="': ' \+ item\.summary">/.test(indexHtml),
    'the Index result item must bold item.topic directly (no "[Index]" category label) followed by ": " + item.summary'
  );
  assert.ok(
    !/result-index">\s*<b>\[Index\]<\/b>/.test(indexHtml),
    'the Index result item must not show a literal "[Index]" tag prefix'
  );
});
