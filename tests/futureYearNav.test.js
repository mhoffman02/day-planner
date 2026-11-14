/**
 * @file futureYearNav.test.js
 * @description Future Planning year nav follows the quiet date header: the "This Year" link shows
 * only when the matrix is off the current year, judged by the reactive todayStr (not the wall clock).
 * Runs against both client copies via plannerHarness.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

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
