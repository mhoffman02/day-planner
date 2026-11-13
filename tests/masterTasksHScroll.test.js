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

  // Action cell holds date input + Move to Date + delete (~274px with padding): a narrower column clips the delete button.
  test(`${rel}: Master Tasks action column fits its controls and the table min-width covers all columns`, () => {
    const css = fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
    const action = Number(css.match(/--tc-master-6,\s*(\d+)px/)[1]);
    assert.ok(action >= 290, `action column ${action}px < 290px`);
    const min = Number(css.match(/\.master-tasks-table\s*\{[^}]*min-width:\s*(\d+)px/)[1]);
    const fixed = [1, 2, 4, 5].reduce((sum, n) => sum + Number(css.match(new RegExp(`--tc-master-${n},\\s*(\\d+)px`))[1]), action);
    assert.ok(min >= fixed + 240, `min-width ${min}px leaves under 240px for the title column (fixed columns ${fixed}px)`);
  });
}
