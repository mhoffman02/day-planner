/**
 * @file goalsMarkup.test.js
 * @description The Goals tab: nav button right after Future, and the goals view template, in both
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

  test(`${rel}: Goals nav button sits right after Future`, () => {
    const futureAt = html.indexOf("setView('future-matrix')");
    const goalsAt = html.indexOf("setView('goals')");
    assert.ok(futureAt > 0 && goalsAt > futureAt, 'Goals nav button missing or before Future');
    const between = html.slice(futureAt, goalsAt);
    assert.equal((between.match(/segment-btn/g) || []).length, 1, 'another nav button sits between Future and Goals');
    assert.match(html.slice(goalsAt, goalsAt + 400), /material-symbols-outlined icon-16">flag</);
  });

  test(`${rel}: goals view template has the cascade tables and detail editor`, () => {
    assert.match(html, /<template x-if="activeView === 'goals'">/);
    for (const needle of ['Horizons', 'Balance', 'Breakdown', '+ Someday goal', '+ Break down', 'Add to Today as A', 'Send to Future']) {
      assert.ok(html.includes(needle), `missing "${needle}"`);
    }
  });
}
