/**
 * @file notesPlainTextLayout.test.js
 * @description User 2026-11-12: Google Tasks notes are plain text; line breaks and runs of spaces must show as typed
 * in the task hover popover and in the notes edit box. Plain-text layout is CSS white-space pre-wrap, no markup.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function whiteSpaceOf(css, selector) {
  const re = new RegExp(`(^|\\n)\\s*${selector.replace(/[.\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const m = css.match(re);
  assert.ok(m, `${selector} rule exists`);
  const ws = m[2].match(/white-space:\s*([a-z-]+)/);
  return ws && ws[1];
}

for (const p of ['src/styles.css', 'gas-app/Styles.html']) {
  test(`${p}: task hover notes keep the typed line breaks`, () => {
    assert.equal(whiteSpaceOf(read(p), '.task-tip-popover .event-note-description'), 'pre-wrap');
  });
  test(`${p}: notes edit box keeps line breaks and wraps long lines`, () => {
    assert.equal(whiteSpaceOf(read(p), '.notes-editor-text'), 'pre-wrap');
  });
}
