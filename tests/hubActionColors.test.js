/**
 * @file hubActionColors.test.js
 * @description Triage action row: colour mapping (teal = creates a task or note, muted `hub-action-quiet` = routine
 * routing, red = Delete only) and form (Task Today / Task Later keep a text label, every other action is icon-only
 * with a hover title and aria-label). Colour only: no fills, flat 3px chrome, every button keeps its stale lock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const TEAL = ['Task Today', 'Task Later', 'Note', 'Waiting'];
const QUIET = ['Send to Meeting', 'Read Later', 'Dismiss', 'Archive in Gmail', 'Open Gmail'];
const TEXT_BUTTONS = ['Task Today', 'Task Later'];

function actionButtons(html) {
  const group = html.split('class="hub-actions"')[1].split('</div>')[0];
  return [...group.matchAll(/<(button|a) ([^>]*class="hub-action-btn[^"]*"[^>]*)>([\s\S]*?)<\/\1>/g)]
    .map((m) => ({
      attrs: m[2],
      // aria-label is "<Action>: <subject>"; Delete's reads "Delete (move to Gmail Trash): ..."
      label: (m[2].match(/:aria-label="'([^:']+?)(?: \([^)]*\))?: '/) || [])[1],
      text: m[3].replace(/<span[^>]*>[^<]*<\/span>/g, '').replace(/<[^>]+>/g, '').trim(),
      hasIcon: /material-symbols-outlined/.test(m[3]),
    }));
}

for (const file of ['index.html', 'gas-app/Index.html']) {
  test(`${file}: action buttons carry the colour classes`, () => {
    const btns = actionButtons(read(file));
    assert.equal(btns.length, 10);
    for (const b of btns) {
      assert.ok(b.label, `label parsed from aria-label: ${b.attrs}`);
      const quiet = /hub-action-quiet/.test(b.attrs);
      if (TEAL.includes(b.label)) assert.ok(!quiet, `${b.label} stays teal`);
      if (QUIET.includes(b.label)) assert.ok(quiet, `${b.label} is muted`);
      if (b.label === 'Delete') assert.ok(/hub-action-danger/.test(b.attrs) && !quiet, 'Delete is red only');
      if (b.label !== 'Open Gmail') assert.match(b.attrs, /:disabled="triageStale"/, `${b.label} keeps its stale lock`);
    }
  });

  test(`${file}: only Task Today and Task Later are text buttons, the rest are icon-only with a title`, () => {
    for (const b of actionButtons(read(file))) {
      if (TEXT_BUTTONS.includes(b.label)) {
        assert.ok(!b.hasIcon && b.text === b.label, `${b.label} keeps its text label`);
      } else {
        assert.ok(b.hasIcon, `${b.label} shows an icon`);
        assert.match(b.attrs, /\stitle="[^"]+"/, `${b.label} has a hover title`);
        assert.equal(b.text, '', `${b.label} shows no word beside its icon`);
      }
    }
  });
}

for (const file of ['src/styles.css', 'gas-app/Styles.html']) {
  test(`${file}: .hub-action-quiet uses tokens, no fill`, () => {
    const css = read(file);
    const rule = css.match(/\.hub-action-btn\.hub-action-quiet\s*\{([^}]*)\}/);
    assert.ok(rule, 'rule exists');
    assert.match(rule[1], /color:\s*var\(--text-muted\)/);
    assert.match(rule[1], /border-color:\s*var\(--border-line\)/);
    assert.ok(!/!important|background:\s*(?!transparent)/.test(rule[1]));
  });
}
