/**
 * @file delegateCheckBack.test.js
 * @description Delegated on a daily task: the status menu asks who and when to check back, the
 * server makes an open "Check back" task on that day and marks the source Ⓓ, the toast has Undo,
 * and a failed delegate rolls back, re-reads Google, and retries with the same date and owner.
 * Runs against both client copies via plannerHarness.
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
  describe(`delegate picker in the daily status menu [${c.label}]`, () => {
    it('opens with an empty owner and the default check-back day', () => {
      const vm = dailyVm(c, { tasks: [{ id: 't1', title: 'a', status: '•' }] });
      vm.forwardPickTaskId = 't1';
      vm.openDelegatePicker({ id: 't1' });
      assert.equal(vm.delegatePickTaskId, 't1');
      assert.equal(vm.delegateOwner, '');
      assert.equal(vm.delegatePickDate, TGT);
      assert.equal(vm.forwardPickTaskId, null);
    });

    it('rejects a check-back date before the default day', () => {
      const vm = dailyVm(c);
      vm.openDelegatePicker({ id: 't1' });
      vm.delegatePickDate = SRC;
      assert.equal(vm.isDelegatePickValid(), false);
      vm.delegatePickDate = '2031-03-20';
      assert.equal(vm.isDelegatePickValid(), true);
    });

    it('keeps the menu open while the picker is up', async () => {
      const vm = dailyVm(c);
      vm.openStatusMenuTaskId = 't1';
      vm.openDelegatePicker({ id: 't1' });
      vm.scheduleStatusMenuClose('t1');
      await settle();
      assert.equal(vm.openStatusMenuTaskId, 't1');
    });

    it('submitting sends the date and the cleaned owner, then closes the menu', async () => {
      const calls = [];
      const task = { id: 't1', title: '[A2] Call vendor', status: '•' };
      const vm = dailyVm(c, { tasks: [task], bridge: { delegateDailyTask: async (...a) => { calls.push(a); return { followUpTask: { id: 'f1' } }; } } });
      captureToasts(vm);
      vm.openStatusMenuTaskId = 't1';
      vm.openDelegatePicker(task);
      vm.delegateOwner = '  [Pat] Lee ';
      await vm.submitDelegate(task, '2031-03-17');
      await settle();
      assert.deepEqual(calls, [[SRC, 't1', '2031-03-17', 'Pat Lee']]);
      assert.equal(vm.openStatusMenuTaskId, null);
      assert.equal(vm.delegatePickTaskId, null);
      assert.equal(task.status, 'Ⓓ');
    });

    it('submitting an invalid picked date sends nothing', async () => {
      const calls = [];
      const task = { id: 't1', title: 'a', status: '•' };
      const vm = dailyVm(c, { tasks: [task], bridge: { delegateDailyTask: async (...a) => { calls.push(a); return { followUpTask: { id: 'f1' } }; } } });
      vm.openDelegatePicker(task);
      vm.delegatePickDate = '2031-03-01';
      await vm.submitDelegate(task);
      await settle();
      assert.deepEqual(calls, []);
    });

    it('a daily Ⓓ set without a date still makes a check-back on the default day', async () => {
      const calls = [];
      const task = { id: 't1', title: 'a', status: '•' };
      const vm = dailyVm(c, {
        tasks: [task],
        bridge: {
          delegateDailyTask: async (...a) => { calls.push(a); return { followUpTask: { id: 'f1' } }; },
          updateDailyTask: async () => { throw new Error('plain status write must not be used'); }
        }
      });
      captureToasts(vm);
      await vm.setTaskStatus(task, 'Ⓓ');
      await settle();
      assert.deepEqual(calls, [[SRC, 't1', TGT, '']]);
    });

    it('a master task Ⓓ stays a plain status write', async () => {
      const calls = [];
      const mTask = { id: 'm1', title: 'a', status: '•', category: 'General' };
      const vm = dailyVm(c, {
        bridge: {
          updateMasterTask: async (id, u) => { calls.push(['master', id, u.status]); return { id, ...u }; },
          updateDailyTask: async (d, id, u) => { calls.push(['daily', id, u.status]); return { id, ...u }; },
          delegateDailyTask: async () => { calls.push(['delegate']); return { followUpTask: { id: 'x' } }; }
        }
      });
      vm.masterTasks = [mTask];
      await vm.setTaskStatus(mTask, 'Ⓓ');
      await settle();
      assert.deepEqual(calls[0], ['master', 'm1', 'Ⓓ']);
      assert.ok(!calls.some((call) => call[0] === 'delegate'), 'no check-back task for a master task');
    });
  });

  describe(`delegate result and Undo [${c.label}]`, () => {
    it('the toast names the check-back day and carries an undo for the follow-up', async () => {
      const task = { id: 't1', title: '[A1] Call vendor', status: '○' };
      const vm = dailyVm(c, { tasks: [task], bridge: { delegateDailyTask: async () => ({ followUpTask: { id: 'f1' } }) } });
      const toasts = captureToasts(vm);
      await vm.selectTaskStatus(task, 'Ⓓ', TGT, 'Pat');
      await settle();
      assert.equal(toasts.length, 1);
      assert.match(toasts[0].msg, /^Delegated "Call vendor" to Pat\. Check back /);
      assert.deepEqual(toasts[0].undo, { status: 'Ⓓ', sourceId: 't1', sourceDate: SRC, copyId: 'f1', targetDate: TGT, prevStatus: '○' });
    });

    it('undo deletes the follow-up, then puts the source back to its earlier status', async () => {
      const order = [];
      const task = { id: 't1', title: 'a', status: 'Ⓓ' };
      const vm = dailyVm(c, {
        tasks: [task],
        bridge: {
          deleteDailyTask: async (d, id) => { order.push(['delete', d, id]); return true; },
          updateDailyTask: async (d, id, u) => { order.push(['update', d, id, u.status]); return { id, ...u }; }
        }
      });
      const toasts = captureToasts(vm);
      await vm.undoForward({ status: 'Ⓓ', sourceId: 't1', sourceDate: SRC, copyId: 'f1', targetDate: TGT, prevStatus: '○' });
      await settle();
      assert.deepEqual(order, [['delete', TGT, 'f1'], ['update', SRC, 't1', '○']]);
      assert.equal(vm.dailyTasks[0].status, '○');
      assert.equal(toasts.at(-1).msg, 'Delegation undone');
    });

    it('undo of a re-delegation (source was already Ⓓ) only deletes the new follow-up', async () => {
      const order = [];
      const task = { id: 't1', title: 'a', status: 'Ⓓ' };
      const vm = dailyVm(c, {
        tasks: [task],
        bridge: {
          deleteDailyTask: async (d, id) => { order.push(['delete', id]); return true; },
          updateDailyTask: async (d, id) => { order.push(['update', id]); return { id }; }
        }
      });
      captureToasts(vm);
      await vm.undoForward({ status: 'Ⓓ', sourceId: 't1', sourceDate: SRC, copyId: 'f2', targetDate: TGT, prevStatus: 'Ⓓ' });
      await settle();
      assert.deepEqual(order, [['delete', 'f2']]);
      assert.equal(vm.dailyTasks[0].status, 'Ⓓ');
    });
  });

  describe(`undo restores a plain status, never a new forward or delegate [${c.label}]`, () => {
    function undoVm(c2, status) {
      const calls = [];
      const task = { id: 't1', title: 'a', status };
      const vm = dailyVm(c2, {
        tasks: [task],
        bridge: {
          deleteDailyTask: async () => { calls.push('delete'); return true; },
          updateDailyTask: async (d, id, u) => { calls.push('update:' + u.status); return { id, ...u }; },
          forwardDailyTask: async () => { calls.push('forward'); return { forwardedTask: { id: 'x' } }; },
          delegateDailyTask: async () => { calls.push('delegate'); return { followUpTask: { id: 'y' } }; }
        }
      });
      captureToasts(vm);
      return { vm, calls, task };
    }

    it('forward of a Ⓓ task, then Undo: back to Ⓓ without a new check-back task', async () => {
      const { vm, calls, task } = undoVm(c, '→');
      await vm.undoForward({ sourceId: 't1', sourceDate: SRC, copyId: 'c1', targetDate: TGT, prevStatus: 'Ⓓ' });
      await settle();
      assert.deepEqual(calls, ['delete', 'update:Ⓓ']);
      assert.equal(task.status, 'Ⓓ');
    });

    it('delegate of a → task, then Undo: back to → without a new forward copy', async () => {
      const { vm, calls, task } = undoVm(c, 'Ⓓ');
      await vm.undoForward({ status: 'Ⓓ', sourceId: 't1', sourceDate: SRC, copyId: 'f1', targetDate: TGT, prevStatus: '→' });
      await settle();
      assert.deepEqual(calls, ['delete', 'update:→']);
      assert.equal(task.status, '→');
    });
  });

  describe(`failed delegate [${c.label}]`, () => {
    it('rolls back, re-reads the day, and retries with the same date and owner', async () => {
      const calls = [];
      let fail = true;
      const task = { id: 't1', title: 'a', status: '•' };
      const vm = dailyVm(c, {
        tasks: [task],
        bridge: {
          delegateDailyTask: async (...a) => {
            calls.push(a);
            if (fail) throw new Error('Nothing was delegated: tasks 503');
            return { followUpTask: { id: 'f1' } };
          },
          getDailyData: async () => ({ tasks: [{ id: 't1', title: 'a', status: '•' }], calendarEvents: [] })
        }
      });
      captureToasts(vm);
      await captureConsoleError(async () => {
        await vm.selectTaskStatus(task, 'Ⓓ', '2031-03-17', 'Pat');
        await settle();
      });
      assert.equal(vm.dailyTasks.find((t) => t.id === 't1').status, '•');
      const err = vm.errorTray.find((e) => e.key === 'task-status:t1');
      assert.ok(err, 'error tray entry');
      assert.match(err.message, /^Could not delegate task: Nothing was delegated/);
      assert.equal(typeof err.retry, 'function');
      fail = false;
      await err.retry();
      await settle();
      assert.deepEqual(calls.at(-1), [SRC, 't1', '2031-03-17', 'Pat']);
    });

    it('a possibly duplicated follow-up is not offered a blind Retry', async () => {
      const task = { id: 't1', title: 'a', status: '•' };
      const vm = dailyVm(c, {
        tasks: [task],
        bridge: {
          delegateDailyTask: async () => { throw new Error('Delegate failed: ... The task may be duplicated on 2031-03-13.'); },
          getDailyData: async () => ({ tasks: [{ id: 't1', title: 'a', status: '•' }], calendarEvents: [] })
        }
      });
      captureToasts(vm);
      await captureConsoleError(async () => {
        await vm.selectTaskStatus(task, 'Ⓓ', TGT, '');
        await settle();
      });
      const err = vm.errorTray.find((e) => e.key === 'task-status:t1');
      assert.ok(err, 'error tray entry');
      assert.equal(err.retry, null);
    });
  });
}
