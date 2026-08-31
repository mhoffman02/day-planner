'use strict';

// Regression coverage for a class-name drift bug: gas-app/Index.html's task quick-add
// <form> carries class="task-quick-add-bar", but the matching CSS rule in both
// src/styles.css and gas-app/Styles.html was still named .task-input-row (a stale name
// from before a rename), so it never applied. The row had no flex/align-items and no
// margin-bottom, which is why it looked cramped against the "Tasks" header above and the
// task table's column headers below. Fixed by renaming the CSS rule to match the markup.
//
// Static contract check against raw source, since Alpine .data() markup can't be
// exercised directly under Node's test runner (see tests/gasAppAddNoteCard.test.js for
// the same pattern).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const indexHtml = fs.readFileSync(path.join(__dirname, '../gas-app/Index.html'), 'utf8');
const stylesHtml = fs.readFileSync(path.join(__dirname, '../gas-app/Styles.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');

test('gas-app/Index.html: task quick-add form carries class="task-quick-add-bar"', () => {
  assert.ok(
    /<form[^>]*class="task-quick-add-bar"/.test(indexHtml),
    'the task quick-add form must carry class="task-quick-add-bar" so its layout CSS applies'
  );
});

for (const [label, css] of [['gas-app/Styles.html', stylesHtml], ['src/styles.css', stylesCss]]) {
  test(`${label}: .task-quick-add-bar is styled (matches the markup class, not a stale name)`, () => {
    assert.ok(
      /\.task-quick-add-bar\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;/.test(css),
      `${label} must define .task-quick-add-bar with display: flex and align-items: center so the ` +
        `priority select, task input, and add button share a common vertical baseline`
    );
    assert.ok(
      /\.task-quick-add-bar\s*\{[^}]*margin-bottom:\s*\d/.test(css),
      `${label}'s .task-quick-add-bar must have a margin-bottom to separate it from the task table below`
    );
    assert.ok(
      !/\.task-input-row\s*\{/.test(css),
      `${label} must not still define the old .task-input-row selector -- it matches no element in ` +
        `gas-app/Index.html and its rules would silently never apply`
    );
  });
}
