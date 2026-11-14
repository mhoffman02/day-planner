/**
 * @file futureYearNav.test.js
 * @description Future Planning year nav follows the quiet date header: the "This Year" link shows
 * only when the matrix is off the current year, judged by the reactive todayStr (not the wall clock).
 * Runs against both client copies via plannerHarness.
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// The nav is right-aligned, so a "This Year" link mounted only when off-year made the chevrons jump.
// It sits left of the chevrons and is always rendered; off the current year it only toggles visibility.
for (const file of ['index.html', 'gas-app/Index.html']) {
  test(`${file}: "This Year" sits left of the chevrons and keeps its room when hidden`, () => {
    const nav = read(file).split('class="future-matrix-year-nav"')[1].split('</div>')[0];
    const link = nav.indexOf('class="year-link-btn"');
    assert.ok(link > -1, 'year link present');
    assert.ok(link < nav.indexOf('changeFutureMatrixYear(-1)'), 'year link precedes the previous-year chevron');
    assert.ok(!/x-if="isOffCurrentFutureYear\(\)"/.test(nav), 'not mounted conditionally');
    assert.match(nav, /:class="\{ 'is-placeholder': !isOffCurrentFutureYear\(\) \}"/);
  });
}

for (const file of ['src/styles.css', 'gas-app/Styles.html']) {
  test(`${file}: a placeholder year link is invisible but keeps its width`, () => {
    assert.match(read(file), /\.year-link-btn\.is-placeholder\s*\{\s*visibility:\s*hidden;\s*\}/);
  });
}

for (const c of await bothClients()) {
  describe(`future year nav [${c.label}]`, () => {
    it('isOffCurrentFutureYear is false on the current year, true on any other', () => {
      const vm = makeVm(c.factory, { todayStr: '2031-03-12', futureMatrixYear: 2031 });
      assert.equal(vm.isOffCurrentFutureYear(), false);
      vm.futureMatrixYear = 2032;
      assert.equal(vm.isOffCurrentFutureYear(), true);
      vm.futureMatrixYear = 2030;
      assert.equal(vm.isOffCurrentFutureYear(), true);
    });
  });
}
