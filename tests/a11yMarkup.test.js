import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const FILES = ['index.html', 'gas-app/Index.html'];

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

for (const rel of FILES) {
  test(`${rel}: no role=status on <aside> (aria-allowed-role)`, () => {
    const hits = read(rel).match(/<aside\b[^>]*\brole="status"[^>]*>/g) || [];
    assert.deepEqual(hits, [], `aside cannot take role=status: ${hits.length} hit(s)`);
  });

  test(`${rel}: every div/span with aria-label has an explicit role (aria-prohibited-attr)`, () => {
    const tags = read(rel).match(/<(div|span)\b[^>]*>/g) || [];
    const bad = tags.filter((t) => /\baria-label=/.test(t) && !/\srole="/.test(t));
    assert.deepEqual(bad, [], `aria-label on generic element without role: ${bad.length} hit(s)`);
  });

  test(`${rel}: heading levels never skip (heading-order)`, () => {
    const levels = [];
    const re = /<h([1-6])[\s>]/g;
    let m;
    while ((m = re.exec(read(rel))) !== null) levels.push(Number(m[1]));
    for (let i = 1; i < levels.length; i += 1) {
      assert.ok(
        levels[i] <= levels[i - 1] + 1,
        `heading level jumps h${levels[i - 1]} -> h${levels[i]} at heading #${i + 1}`,
      );
    }
  });

  test(`${rel}: no role=group on <form> (aria-allowed-role)`, () => {
    const hits = read(rel).match(/<form\b[^>]*\brole="group"[^>]*>/g) || [];
    assert.deepEqual(hits, []);
  });

  test(`${rel}: panel titles are h2, not h3 under the h1 (heading-order)`, () => {
    assert.equal((read(rel).match(/<h3 class="panel-header-title">/g) || []).length, 0);
  });

  test(`${rel}: the scrollable schedule list is keyboard focusable (scrollable-region-focusable)`, () => {
    const tag = read(rel).match(/<section class="schedule-list"[^>]*>/)[0];
    assert.match(tag, /\btabindex="0"/);
  });
}
