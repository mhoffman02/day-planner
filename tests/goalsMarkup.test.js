/**
 * @file goalsMarkup.test.js
 * @description The Goals tab: nav order (Goals just before About), and the goals view template, in both
 * index.html (local preview) and gas-app/Index.html.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const rel of ['index.html', 'gas-app/Index.html']) {
  const html = readFileSync(join(root, rel), 'utf8');

  test(`${rel}: nav order is Today, Triage, Month, Master Tasks, Index, Year, Meeting Prep, Goals, About`, () => {
    const nav = html.slice(html.indexOf('<nav class="view-segmented-control"'), html.indexOf('</nav>', html.indexOf('<nav class="view-segmented-control"')));
    const labels = [...nav.matchAll(/class="segment-btn[^"]*"[\s\S]*?<span>([^<]+)<\/span>/g)].map((m) => m[1]);
    assert.deepEqual(labels, ['Today', 'Triage', 'Triage', 'Month', 'Master Tasks', 'Index', 'Year', 'Meeting Prep', 'Meeting Prep', 'Goals', 'About'],
      'each hub-tab reserve placeholder sits right after its tab');
    const goalsAt = nav.indexOf("setView('goals')");
    assert.match(nav.slice(goalsAt, goalsAt + 400), /material-symbols-outlined icon-16">flag</);
  });

  test(`${rel}: goals view template has the cascade tables and detail editor`, () => {
    assert.match(html, /<template x-if="activeView === 'goals'">/);
    for (const needle of ['Horizons', 'Balance', 'Breakdown', '+ Someday goal', '+ Break down', 'Add to Today as A', 'Send to Year']) {
      assert.ok(html.includes(needle), `missing "${needle}"`);
    }
  });
}
