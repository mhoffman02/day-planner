/**
 * @file forwardMenuOptions.test.js
 * @description Daily status menu forward options: the "next week" preset date, the confirm step
 * before forwarding a task that is already forwarded, and Undo from the forward toast (deletes the
 * copy, restores the source status). Runs against both client copies via plannerHarness.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm, settle, captureConsoleError } from './helpers/plannerHarness.js';

// Far-future days so forwardTargetDate is always "the next day" regardless of the real today.
const SRC = '2031-03-12'; // Wednesday
const TGT = '2031-03-13';

function dayData(tasks = []) {
  return { tasks, calendarEvents: [], noteContent: '', docUrl: '' };
}

function dailyVm(c, { date = SRC, tasks = [], bridge = {} } = {}) {
  const [y, m] = date.split('-').map(Number);
  const vm = makeVm(c.factory, {
    selectedDate: date, selectedYear: y, selectedMonth: m,
    dailyTasks: tasks, masterTasks: [], calendarEvents: [], dailyNote: '', bridge
  });
  vm.trigger2WaySync = async () => {};
  c.cache.setCached(date, dayData(tasks.map((t) => ({ ...t }))));
  c.cache.setCachedMasterTasks([]);
  return vm;
}

function captureToasts(vm) {
  const toasts = [];
  vm.showTaskToast = (msg, undo = null) => { toasts.push({ msg, undo }); };
  return toasts;
}

for (const c of await bothClients()) {
  describe(`forward "next week" preset [${c.label}]`, () => {
    it('is the Monday after the source day', () => {
      const vm = dailyVm(c, { date: SRC });
      assert.equal(vm.forwardNextWeekDate(), '2031-03-17');
    });

    it('is hidden (null) when that Monday is already the one-click target', () => {
      const vm = dailyVm(c, { date: '2031-03-16' }); // Sunday: tomorrow is Monday
      assert.equal(vm.forwardNextWeekDate(), null);
    });

    it('from a Monday, is the following Monday', () => {
      const vm = dailyVm(c, { date: '2031-03-17' });
      assert.equal(vm.forwardNextWeekDate(), '2031-03-24');
    });
  });

  describe(`re-forwarding an already forwarded task asks first [${c.label}]`, () => {
    it('a forward pick on a → task only opens the confirm; nothing is sent', async () => {
      const calls = [];
      const task = { id: 't1', title: '[A1] Call vendor', status: '→' };
      const vm = dailyVm(c, { tasks: [task], bridge: { forwardDailyTask: async (...a) => { calls.push(a); return { forwardedTask: { id: 'x' } }; } } });
      vm.openStatusMenuTaskId = 't1';
      await vm.requestForward(task, '2031-03-20');
      await settle();
      assert.deepEqual(calls, []);
      assert.deepEqual(vm.forwardConfirm, { taskId: 't1', date: '2031-03-20' });
      assert.equal(vm.openStatusMenuTaskId, 't1');
    });

    it('confirming forwards to the confirmed date', async () => {
      const calls = [];
      const task = { id: 't1', title: '[A1] Call vendor', status: '→' };
      const vm = dailyVm(c, { tasks: [task], bridge: { forwardDailyTask: async (...a) => { calls.push(a); return { forwardedTask: { id: 'c2', title: '[A1] Call vendor', status: '•' } }; } } });
      captureToasts(vm);
      await vm.requestForward(task);
      await vm.confirmForward(task);
      await settle();
      assert.deepEqual(calls, [[SRC, 't1', TGT]]);
      assert.equal(vm.forwardConfirm, null);
    });

    it('an open task forwards at once, without a confirm', async () => {
      const calls = [];
      const task = { id: 't1', title: 'a', status: '•' };
      const vm = dailyVm(c, { tasks: [task], bridge: { forwardDailyTask: async (...a) => { calls.push(a); return { forwardedTask: { id: 'c1' } }; } } });
      captureToasts(vm);
      await vm.requestForward(task);
      await settle();
      assert.deepEqual(calls, [[SRC, 't1', TGT]]);
      assert.equal(vm.forwardConfirm, null);
    });
  });

  describe(`forward toast Undo [${c.label}]`, () => {
    it('the success toast carries an undo with the copy id and the status before the forward', async () => {
      const task = { id: 't1', title: '[A1] Call vendor', status: '○' };
      const vm = dailyVm(c, { tasks: [task], bridge: { forwardDailyTask: async () => ({ forwardedTask: { id: 'c1' } }) } });
      const toasts = captureToasts(vm);
      await vm.setTaskStatus(task, '→');
      await settle();
      assert.equal(toasts.length, 1);
      assert.deepEqual(toasts[0].undo, { sourceId: 't1', sourceDate: SRC, copyId: 'c1', targetDate: TGT, prevStatus: '○' });
    });

    it('undo deletes the copy, then puts the source back to its earlier status', async () => {
      const order = [];
      const task = { id: 't1', title: 'a', status: '→' };
      const vm = dailyVm(c, {
        tasks: [task],
        bridge: {
          deleteDailyTask: async (d, id) => { order.push(['delete', d, id]); return true; },
          updateDailyTask: async (d, id, u) => { order.push(['update', d, id, u.status]); return { id, ...u }; }
        }
      });
      captureToasts(vm);
      await vm.undoForward({ sourceId: 't1', sourceDate: SRC, copyId: 'c1', targetDate: TGT, prevStatus: '○' });
      await settle();
      assert.deepEqual(order, [['delete', TGT, 'c1'], ['update', SRC, 't1', '○']]);
      assert.equal(vm.dailyTasks[0].status, '○');
    });

    it('undo of a re-forward (source was already →) only deletes the new copy', async () => {
      const order = [];
      const task = { id: 't1', title: 'a', status: '→' };
      const vm = dailyVm(c, {
        tasks: [task],
        bridge: {
          deleteDailyTask: async (d, id) => { order.push(['delete', id]); return true; },
          updateDailyTask: async (d, id) => { order.push(['update', id]); return { id }; },
          forwardDailyTask: async () => { order.push(['forward']); return { forwardedTask: { id: 'x' } }; }
        }
      });
      captureToasts(vm);
      await vm.undoForward({ sourceId: 't1', sourceDate: SRC, copyId: 'c2', targetDate: TGT, prevStatus: '→' });
      await settle();
      assert.deepEqual(order, [['delete', 'c2']]);
      assert.equal(vm.dailyTasks[0].status, '→');
    });

    it('when the open day is the target, the copy leaves the live list', async () => {
      const copy = { id: 'c1', title: 'a', status: '•' };
      const vm = dailyVm(c, {
        date: TGT,
        tasks: [copy],
        bridge: {
          deleteDailyTask: async () => true,
          updateDailyTask: async (d, id, u) => ({ id, ...u })
        }
      });
      captureToasts(vm);
      await vm.undoForward({ sourceId: 't1', sourceDate: SRC, copyId: 'c1', targetDate: TGT, prevStatus: '•' });
      await settle();
      assert.deepEqual(vm.dailyTasks, []);
      assert.deepEqual(c.cache.getCached(TGT).tasks, []);
    });

    it('a failed delete leaves the forward in place and reports an error with Retry', async () => {
      const updates = [];
      const task = { id: 't1', title: 'a', status: '→' };
      const vm = dailyVm(c, {
        tasks: [task],
        bridge: {
          deleteDailyTask: async () => { throw new Error('delete 503'); },
          updateDailyTask: async (d, id, u) => { updates.push(u); return { id, ...u }; }
        }
      });
      const toasts = captureToasts(vm);
      const logs = await captureConsoleError(async () => {
        await vm.undoForward({ sourceId: 't1', sourceDate: SRC, copyId: 'c1', targetDate: TGT, prevStatus: '•' });
        await settle();
      });
      assert.deepEqual(updates, []);
      assert.equal(vm.dailyTasks[0].status, '→');
      assert.deepEqual(toasts, []);
      const err = vm.errorTray.find((e) => e.key === 'task-undo-forward:t1');
      assert.ok(err, 'error tray entry');
      assert.match(err.message, /Could not undo forward: delete 503/);
      assert.equal(typeof err.retry, 'function');
      assert.ok(logs.some((l) => /delete 503/.test(l)), 'stack logged');
    });
  });
}
