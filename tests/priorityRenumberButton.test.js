/**
 * @file priorityRenumberButton.test.js
 * @description The Pri header renumber control is a bordered icon button (format_list_numbered), not a bare #,
 * and the Pri column is wide enough to hold the label, sort arrow and button.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('priority renumber button', () => {
  it('Index uses the icon, keeps the accessible name and gives the Pri header its own width class', () => {
    const src = read('gas-app/Index.html');
    assert.match(src, /<button type="button" class="priority-renumber-btn"[^>]*aria-label="Renumber priorities"[^>]*><span class="material-symbols-outlined icon-14" aria-hidden="true">format_list_numbered<\/span><\/button>/);
    assert.match(src, /<th scope="col" class="th-w-pri th-sortable" @click="setTaskSort\('dailyTaskSort', 'priority'\)">/);
  });

  for (const p of ['src/styles.css', 'gas-app/Styles.html']) {
    it(`${p}: Pri column is at least 64px and the button is a bordered, hoverable square`, () => {
      const css = read(p);
      const w = css.match(/\.th-w-pri\s*\{\s*width:\s*(\d+)px/);
      assert.ok(w && Number(w[1]) >= 64, `${p}: .th-w-pri width`);
      const btn = css.match(/\.priority-renumber-btn\s*\{[^}]*\}/)[0];
      assert.match(btn, /border:\s*1px solid var\(--/);
      assert.match(btn, /border-radius:\s*4px/);
      assert.match(css, /\.priority-renumber-btn:hover\s*\{[^}]*border-color:\s*var\(--binder-teal\)/);
    });
  }
});
