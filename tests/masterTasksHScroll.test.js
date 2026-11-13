import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Fixed-layout table inside an overflow-x:auto wrapper only scrolls when the table has a min-width.
for (const rel of ['src/styles.css', 'gas-app/Styles.html']) {
  test(`${rel}: Master Tasks table has a min-width so the wrapper scrolls sideways on demand`, () => {
    const css = fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
    const rule = css.match(/\.master-tasks-table\s*\{([^}]*)\}/);
    assert.ok(rule, '.master-tasks-table rule exists');
    assert.match(rule[1], /min-width:\s*\d+px/);
  });
}
