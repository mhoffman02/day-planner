/**
 * @file dayRollover.test.js
 * @description Today tab must not keep showing yesterday after midnight: a reactive todayStr
 * drives isOffToday, checkDayRollover advances a view that was on the old today (and leaves a
 * deliberately chosen other day in place), and a tab hidden past the stale threshold reloads.
 * Runs against both client copies via plannerHarness.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

const DAY = '2031-03-12';
const NEXT_MORNING = new Date(2031, 2, 13, 0, 5);
const SAME_DAY_LATER = new Date(2031, 2, 12, 15, 0);

for (const c of await bothClients()) {
  describe(`day rollover [${c.label}]`, () => {
    function vmOn(selectedDate) {
      const [y, m] = selectedDate.split('-').map(Number);
      const vm = makeVm(c.factory, { selectedDate, selectedYear: y, selectedMonth: m, todayStr: DAY });
      vm.loads = [];
      vm.loadDayData = async () => { vm.loads.push(vm.selectedDate); };
      return vm;
    }

    it('isOffToday compares against the reactive todayStr, not the wall clock', () => {
      assert.equal(vmOn(DAY).isOffToday(), false);
      assert.equal(vmOn('2031-03-01').isOffToday(), true);
    });

    it('advances a view that was on the old today and reloads it', async () => {
      const vm = vmOn(DAY);
      await vm.checkDayRollover({ now: NEXT_MORNING });
      assert.equal(vm.todayStr, '2031-03-13');
      assert.equal(vm.selectedDate, '2031-03-13');
      assert.equal(vm.selectedYear, 2031);
      assert.equal(vm.selectedMonth, 3);
      assert.deepEqual(vm.loads, ['2031-03-13']);
    });

    it('keeps a deliberately chosen other day and shows the Today button', async () => {
      const vm = vmOn('2031-03-01');
      await vm.checkDayRollover({ now: NEXT_MORNING });
      assert.equal(vm.selectedDate, '2031-03-01');
      assert.equal(vm.todayStr, '2031-03-13');
      assert.equal(vm.isOffToday(), true);
      assert.deepEqual(vm.loads, []);
    });

    it('reloads the same day after the tab was hidden past the stale threshold', async () => {
      const vm = vmOn(DAY);
      await vm.checkDayRollover({ now: SAME_DAY_LATER, hiddenMs: 16 * 60 * 1000 });
      assert.deepEqual(vm.loads, [DAY]);
    });

    it('does nothing on the same day after a short absence', async () => {
      const vm = vmOn(DAY);
      await vm.checkDayRollover({ now: SAME_DAY_LATER, hiddenMs: 5 * 60 * 1000 });
      assert.deepEqual(vm.loads, []);
      assert.equal(vm.selectedDate, DAY);
    });
  });
}
