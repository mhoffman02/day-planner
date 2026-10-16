/**
 * @file masterTaskParity.test.js
 * @description Master Tasks rows get every status verb Daily rows have: forward (default day, next
 * week, picked date, Undo) and delegate with a check-back day. Each write lands on the row's real
 * task: an undated master (forwardMasterTask), a master paired with its scheduled daily copy (the
 * copy, from its day), or a dated task listed in Master (itself, from its due day). Also covers the
 * live bug where a Daily row whose id is also in the Master list took the plain master write and
 * never made a forward copy. Runs against both client copies via plannerHarness.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm, settle, captureConsoleError } from './helpers/plannerHarness.js';

const SRC = '2031-03-12'; // Wednesday
const TGT = '2031-03-13';
const PICK = '2031-03-20';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function vmWith(c, { daily = [], master = [], bridge = {} } = {}) {
  const [y, m] = SRC.split('-').map(Number);
  const vm = makeVm(c.factory, {
    selectedDate: SRC, selectedYear: y, selectedMonth: m,
    dailyTasks: daily, masterTasks: master, calendarEvents: [], dailyNote: '', bridge
  });
  vm.trigger2WaySync = async () => {};
  c.cache.setCached(SRC, { tasks: daily.map((t) => ({ ...t })), calendarEvents: [], noteContent: '', docUrl: '' });
  c.cache.setCachedMasterTasks(master.map((t) => ({ ...t })));
  return vm;
}

function captureToasts(vm) {
  const toasts = [];
  vm.showTaskToast = (msg, undo = null) => { toasts.push({ msg, undo }); };
  return toasts;
}

function recorder() {
  const calls = [];
  const bridge = {
    forwardDailyTask: async (...a) => { calls.push(['forwardDaily', ...a]); return { forwardedTask: { id: 'n1', title: '[B1] Call vendor', status: '•', category: 'Work' } }; },
    delegateDailyTask: async (...a) => { calls.push(['delegate', ...a]); return { followUpTask: { id: 'k1', title: '[B1] Check back: Call vendor', status: '•', category: 'Work' } }; },
    forwardMasterTask: async (...a) => { calls.push(['forwardMaster', ...a]); return { forwardedTask: { id: 'c9', title: '[B1] Call vendor', status: '•', category: 'Work', sourceMasterId: a[0] } }; },
    undoMasterForward: async (...a) => { calls.push(['undoMaster', ...a]); return { id: a[0], status: a[2], movedTo: null, movedTaskId: null }; },
    updateMasterTask: async (id, u) => { calls.push(['updateMaster', id, u.status]); return { id, ...u }; },
    updateDailyTask: async (d, id, u) => { calls.push(['updateDaily', d, id, u.status]); return { id, ...u }; },
    deleteDailyTask: async (d, id) => { calls.push(['deleteDaily', d, id]); return true; },
    getMasterTasks: async () => []
  };
  return { calls, bridge };
}

for (const c of await bothClients()) {
  describe(`Daily row whose id is also listed in Master [${c.label}]`, () => {
    it('forward still makes a copy (it is a Daily row, not a master write)', async () => {
      const { calls, bridge } = recorder();
      const daily = { id: 't1', title: '[B1] Call vendor', status: '•' };
      const listed = { id: 't1', title: '[B1] Call vendor', status: '•', dueDate: SRC };
      const vm = vmWith(c, { daily: [daily], master: [listed], bridge });
      captureToasts(vm);
      await vm.selectTaskStatus(daily, '→');
      await settle();
      assert.deepEqual(calls[0], ['forwardDaily', SRC, 't1', TGT]);
      assert.equal(listed.status, '→', 'the Master list copy of the same task follows');
    });
  });

  describe(`Master row forward [${c.label}]`, () => {
    it('undated master: forwardMasterTask to the picked day; the row becomes the scheduled pair', async () => {
      const { calls, bridge } = recorder();
      const m = { id: 'm1', title: '[B1] Call vendor', status: '•', category: 'Work', dueDate: null, movedTo: null, movedTaskId: null };
      const vm = vmWith(c, { master: [m], bridge });
      const toasts = captureToasts(vm);
      await vm.selectTaskStatus(m, '→', PICK);
      await settle();
      assert.deepEqual(calls[0], ['forwardMaster', 'm1', PICK]);
      assert.deepEqual({ status: m.status, dueDate: m.dueDate, movedTo: m.movedTo, movedTaskId: m.movedTaskId }, { status: '•', dueDate: PICK, movedTo: PICK, movedTaskId: 'c9' });
      assert.deepEqual(toasts[0].undo, { master: true, sourceId: 'm1', sourceDate: null, copyId: 'c9', targetDate: PICK, prevStatus: '•' });
    });

    it('undated master: the default forward day is today', () => {
      const m = { id: 'm1', title: 'a', status: '•', dueDate: null };
      const vm = vmWith(c, { master: [m] });
      assert.equal(vm.defaultForwardDate(m), todayStr());
    });

    it('scheduled pair: forwards the daily copy from its day, and the new copy joins the Master list', async () => {
      const { calls, bridge } = recorder();
      const m = { id: 'm1', title: '[B1] Call vendor', status: '•', dueDate: SRC, movedTo: SRC, movedTaskId: 'c1' };
      const vm = vmWith(c, { master: [m], bridge });
      captureToasts(vm);
      vm.selectedDate = '2031-04-01';
      await vm.selectTaskStatus(m, '→');
      await settle();
      assert.deepEqual(calls[0], ['forwardDaily', SRC, 'c1', TGT]);
      assert.equal(m.status, '→');
      assert.ok(vm.masterTasks.some((t) => t.id === 'n1' && t.dueDate === TGT), 'new copy listed');
    });

    it('dated task listed in Master: forwards itself from its due day', async () => {
      const { calls, bridge } = recorder();
      const t = { id: 't7', title: '[B1] Call vendor', status: '•', dueDate: SRC, movedTo: null, movedTaskId: null };
      const vm = vmWith(c, { master: [t], bridge });
      captureToasts(vm);
      vm.selectedDate = '2031-04-01';
      await vm.selectTaskStatus(t, '→', PICK);
      await settle();
      assert.deepEqual(calls[0], ['forwardDaily', SRC, 't7', PICK]);
    });

    it('Move to Date in the Action column uses the same forward', async () => {
      const { calls, bridge } = recorder();
      const m = { id: 'm1', title: '[B1] Call vendor', status: '•', dueDate: null, movedTo: null, movedTaskId: null, _moveDate: PICK };
      const vm = vmWith(c, { master: [m], bridge });
      captureToasts(vm);
      await vm.moveMasterTaskToDate(m);
      await settle();
      assert.deepEqual(calls[0], ['forwardMaster', 'm1', PICK]);
      assert.equal(m._moving, false);
    });

    it('a failed master forward rolls back and reports it', async () => {
      const { bridge } = recorder();
      bridge.forwardMasterTask = async () => { throw new Error('Nothing was forwarded: tasks 503'); };
      const m = { id: 'm1', title: 'a', status: '•', dueDate: null, movedTo: null, movedTaskId: null };
      const vm = vmWith(c, { master: [m], bridge });
      captureToasts(vm);
      await captureConsoleError(async () => {
        await vm.selectTaskStatus(m, '→', PICK);
        await settle();
      });
      assert.equal(m.status, '•');
      const err = vm.errorTray.find((e) => e.key === 'task-status:m1');
      assert.ok(err);
      assert.match(err.message, /^Could not forward task: Nothing was forwarded/);
    });
  });

  describe(`Master row delegate [${c.label}]`, () => {
    it('undated master: delegate with no source day; the check-back task joins the Master list', async () => {
      const { calls, bridge } = recorder();
      const m = { id: 'm1', title: '[B1] Call vendor', status: '•', dueDate: null, movedTo: null, movedTaskId: null };
      const vm = vmWith(c, { master: [m], bridge });
      captureToasts(vm);
      await vm.selectTaskStatus(m, 'Ⓓ', PICK, 'Pat');
      await settle();
      assert.deepEqual(calls[0], ['delegate', '', 'm1', PICK, 'Pat']);
      assert.equal(m.status, 'Ⓓ');
      assert.ok(vm.masterTasks.some((t) => t.id === 'k1' && t.dueDate === PICK));
    });

    it('scheduled pair: delegates the daily copy from its day', async () => {
      const { calls, bridge } = recorder();
      const m = { id: 'm1', title: '[B1] Call vendor', status: '•', dueDate: SRC, movedTo: SRC, movedTaskId: 'c1' };
      const vm = vmWith(c, { master: [m], bridge });
      captureToasts(vm);
      vm.selectedDate = '2031-04-01';
      await vm.selectTaskStatus(m, 'Ⓓ');
      await settle();
      assert.deepEqual(calls[0], ['delegate', SRC, 'c1', TGT, '']);
    });

    it('dated task listed in Master: once delegated it leaves the list (as on reload); Undo brings it back', async () => {
      const { calls, bridge } = recorder();
      const t = { id: 't7', title: '[B1] Call vendor', status: '•', dueDate: SRC, movedTo: null, movedTaskId: null };
      const vm = vmWith(c, { master: [t], bridge });
      const toasts = captureToasts(vm);
      vm.selectedDate = '2031-04-01';
      await vm.selectTaskStatus(t, 'Ⓓ', PICK, '');
      await settle();
      assert.deepEqual(calls[0], ['delegate', SRC, 't7', PICK, '']);
      assert.ok(!vm.masterTasks.some((r) => r.id === 't7'), 'source row left the list');
      assert.ok(vm.masterTasks.some((r) => r.id === 'k1'), 'check-back row listed');
      await vm.undoForward(toasts[0].undo);
      await settle();
      const back = vm.masterTasks.find((r) => r.id === 't7');
      assert.ok(back, 'source row is back');
      assert.equal(back.status, '•');
      assert.ok(!vm.masterTasks.some((r) => r.id === 'k1'));
    });

    it('Daily row delegate: its same-id Master row leaves the list too', async () => {
      const { bridge } = recorder();
      const daily = { id: 't1', title: '[B1] Call vendor', status: '•' };
      const listed = { id: 't1', title: '[B1] Call vendor', status: '•', dueDate: SRC, movedTo: null, movedTaskId: null };
      const vm = vmWith(c, { daily: [daily], master: [listed], bridge });
      captureToasts(vm);
      await vm.selectTaskStatus(daily, 'Ⓓ', TGT, '');
      await settle();
      assert.equal(daily.status, 'Ⓓ');
      assert.ok(!vm.masterTasks.some((r) => r.id === 't1'));
    });

    it('the delegate picker on a Master row starts at that row default day', () => {
      const m = { id: 'm1', title: 'a', status: '•', dueDate: SRC, movedTo: null, movedTaskId: null };
      const vm = vmWith(c, { master: [m] });
      vm.selectedDate = '2031-04-01';
      vm.openDelegatePicker(m);
      assert.equal(vm.delegatePickDate, TGT);
      assert.equal(vm.isDelegatePickValid(SRC), false);
      assert.equal(vm.isDelegatePickValid(TGT), true);
    });
  });

  describe(`Master row Undo [${c.label}]`, () => {
    it('undo of an undated master forward: one server call, the row is undated again, the copy row goes', async () => {
      const { calls, bridge } = recorder();
      const m = { id: 'm1', title: 'a', status: '•', dueDate: PICK, movedTo: PICK, movedTaskId: 'c9' };
      const copyRow = { id: 'c9', title: 'a', status: '•', dueDate: PICK };
      const vm = vmWith(c, { master: [m, copyRow], bridge });
      const toasts = captureToasts(vm);
      await vm.undoForward({ master: true, sourceId: 'm1', sourceDate: null, copyId: 'c9', targetDate: PICK, prevStatus: '○' });
      await settle();
      assert.deepEqual(calls, [['undoMaster', 'm1', 'c9', '○']]);
      assert.deepEqual({ status: m.status, dueDate: m.dueDate, movedTo: m.movedTo, movedTaskId: m.movedTaskId }, { status: '○', dueDate: null, movedTo: null, movedTaskId: null });
      assert.ok(!vm.masterTasks.some((t) => t.id === 'c9'));
      assert.equal(toasts.at(-1).msg, 'Forward undone');
    });

    it('undo of a pair forward: deletes the new copy and restores the pair through its master row', async () => {
      const { calls, bridge } = recorder();
      const m = { id: 'm1', title: 'a', status: '→', dueDate: SRC, movedTo: SRC, movedTaskId: 'c1' };
      const newRow = { id: 'n1', title: 'a', status: '•', dueDate: TGT };
      const vm = vmWith(c, { master: [m, newRow], bridge });
      captureToasts(vm);
      vm.selectedDate = '2031-04-01';
      await vm.undoForward({ sourceId: 'c1', sourceDate: SRC, copyId: 'n1', targetDate: TGT, prevStatus: '•' });
      await settle();
      assert.deepEqual(calls[0], ['deleteDaily', TGT, 'n1']);
      assert.ok(calls.some((x) => x[0] === 'updateMaster' && x[1] === 'm1' && x[2] === '•'), JSON.stringify(calls));
      assert.ok(!calls.some((x) => x[0] === 'forwardDaily' || x[0] === 'delegate'));
      assert.equal(m.status, '•');
      assert.ok(!vm.masterTasks.some((t) => t.id === 'n1'));
    });
  });
}
