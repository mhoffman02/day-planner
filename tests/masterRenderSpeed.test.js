/**
 * @file masterRenderSpeed.test.js
 * @description Master Tasks opens fast: the first 20 rows draw at once and the rest are added in
 * the background; the view stays built after first use (and is pre-built after startup); Day and
 * Master data load in parallel at startup. Runs against both client copies via plannerHarness.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm, settle } from './helpers/plannerHarness.js';

function rows(n) {
  return Array.from({ length: n }, (_, i) => ({ id: 'm' + i, title: '[B1] Task ' + String(i).padStart(3, '0'), status: '•', category: 'Work', dueDate: null }));
}

function vmWith(c, master, bridge = {}) {
  const vm = makeVm(c.factory, {
    selectedDate: '2031-03-12', selectedYear: 2031, selectedMonth: 3,
    dailyTasks: [], masterTasks: master, calendarEvents: [], dailyNote: '',
    bridge: { getMasterTasks: async () => master.map((t) => ({ ...t })), ...bridge }
  });
  vm.trigger2WaySync = async () => {};
  c.cache.setCachedMasterTasks(master.map((t) => ({ ...t })));
  return vm;
}

for (const c of await bothClients()) {
  describe(`Master rows draw progressively [${c.label}]`, () => {
    it('opening Master shows the first 20 rows, then the rest arrive in the background', async () => {
      const vm = vmWith(c, rows(75));
      const opening = vm.setView('master-tasks');
      assert.equal(vm.masterRowsShown.length, 20, 'first paint is 20 rows');
      assert.equal(vm.masterViewBuilt, true);
      await opening;
      await settle(400);
      assert.equal(vm.masterRowsShown.length, 75, 'all rows after the background fill');
    });

    it('once every row is drawn, rows added later show at once', async () => {
      const vm = vmWith(c, rows(30));
      await vm.setView('master-tasks');
      await settle(400);
      vm.masterTasks.push({ id: 'late', title: '[A1] Added later', status: '•', category: 'Work', dueDate: null });
      assert.ok(vm.masterRowsShown.some((t) => t.id === 'late'));
    });

    it('a short list shows every row at once', () => {
      const vm = vmWith(c, rows(8));
      vm.setView('master-tasks');
      assert.equal(vm.masterRowsShown.length, 8);
    });

    it('rows keep the sort and filter of the full list', async () => {
      const vm = vmWith(c, rows(30));
      vm.masterTaskSort = { column: 'title', direction: 'desc' };
      vm.setView('master-tasks');
      assert.equal(vm.masterRowsShown[0].id, 'm29');
    });

    it('pre-building after startup marks the view built and fills it in the background', async () => {
      const vm = vmWith(c, rows(50));
      vm.prebuildMasterView();
      assert.equal(vm.masterViewBuilt, true);
      await settle(400);
      assert.equal(vm.masterRowsShown.length, 50);
    });
  });

  describe(`startup loads run in parallel [${c.label}]`, () => {
    it('Master data starts loading before Day data finishes', async () => {
      const order = [];
      let releaseDay;
      const vm = vmWith(c, rows(3));
      vm.loadDayData = () => { order.push('day:start'); return new Promise((r) => { releaseDay = () => { order.push('day:end'); r(); }; }); };
      vm.loadMasterTasks = async () => { order.push('master:start'); order.push('master:end'); };
      const done = vm.loadStartupData();
      await settle(5);
      releaseDay();
      await done;
      assert.deepEqual(order.slice(0, 3), ['day:start', 'master:start', 'master:end']);
    });
  });
}
