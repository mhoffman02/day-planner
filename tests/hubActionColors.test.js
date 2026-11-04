/**
 * @file hubActionColors.test.js
 * @description Triage action row colour mapping: teal = creates a task or note, muted (`hub-action-quiet`) =
 * routine routing, red = Delete only. Colour only: no fills, flat 3px chrome, every button keeps its stale lock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const TEAL = ['Task Today', 'Task Later', 'Note', 'Waiting'];
const QUIET = ['Send to Meeting', 'Read Later', 'Dismiss', 'Archive', 'Open Gmail'];

function actionButtons(html) {
  const group = html.split('class="hub-actions"')[1].split('</div>')[0];
  return [...group.matchAll(/<(button|a) ([^>]*class="hub-action-btn[^"]*"[^>]*)>([\s\S]*?)<\/\1>/g)]
    .map((m) => ({ attrs: m[2], label: m[3].replace(/<[^>]+>/g, '').trim() }));
}

for (const file of ['index.html', 'gas-app/Index.html']) {
  test(`${file}: action buttons carry the colour classes`, () => {
    const btns = actionButtons(read(file));
    assert.equal(btns.length, 10);
    for (const b of btns) {
      const quiet = /hub-action-quiet/.test(b.attrs);
      if (TEAL.includes(b.label)) assert.ok(!quiet, `${b.label} stays teal`);
      if (QUIET.includes(b.label)) assert.ok(quiet, `${b.label} is muted`);
      if (b.label === 'Delete') assert.ok(/hub-action-danger/.test(b.attrs) && !quiet, 'Delete is red only');
      if (b.label !== 'Open Gmail') assert.match(b.attrs, /:disabled="triageStale"/, `${b.label} keeps its stale lock`);
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
