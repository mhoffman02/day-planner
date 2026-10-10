/**
 * @file saveConcurrency.test.js
 * @description Save-concurrency and cache-correctness regressions, run against BOTH client copies
 * (src/app.js and gas-app/Script.html) through tests/helpers/plannerHarness.js:
 *   (a) a range prefetch whose server read came back with warnings is surfaced in the tray and
 *       never primed into the cache as a clean sync;
 *   (e) note-save debounce is per date: typing on day A then day B inside the debounce window
 *       saves both days;
 *   (f) task deletes, title edits and star toggles go through the per-item save queue: a reload
 *       never resurrects a deleted task or overwrites a pending edit, a delete drops that task
 *       queued saves, and a failed delete restores the task with a tray entry;
 *   (g) caching one task confirmed save never writes another task unconfirmed value;
 *   (h) a reload merge does not stamp the cache as synced while a note is still unsaved.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm, settle, captureConsoleError } from './helpers/plannerHarness.js';

function boom(msg) {
  return async () => { throw new Error(msg); };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function dayData(tasks = [], extra = {}) {
  return { tasks, calendarEvents: [], noteContent: '', docUrl: '', ...extra };
}

function dailyVm(c, { date, tasks = [], master = [], bridge = {}, note = '' }) {
  const [y, m] = date.split('-').map(Number);
  const vm = makeVm(c.factory, {
    selectedDate: date,
    selectedYear: y,
    selectedMonth: m,
    dailyTasks: tasks,
    masterTasks: master,
    calendarEvents: [],
    dailyNote: note,
    bridge
  });
  c.cache.setCached(date, dayData(tasks.map((t) => ({ ...t })), { noteContent: note }));
  c.cache.setCachedMasterTasks(master.map((t) => ({ ...t })));
  return vm;
}

function entry(vm, key) {
  return vm.errorTray.find((e) => e.key === key) || null;
}

const ids = (list) => list.map((t) => t.id);

const clients = await bothClients();

for (const c of clients) {
  describe(`(a) range prefetch warnings [${c.label}]`, () => {
    it('window prefetch with an Events.list warning files a tray entry and leaves the day uncached; opening it re-fetches', async () => {
      const CENTER = '2027-02-10';
      const DAY = '2027-02-13';
      let fetches = 0;
      const vm = dailyVm(c, {
        date: CENTER,
        bridge: {
          getDailyDataRange: async () => ({
            days: { [DAY]: dayData([]) },
            warnings: ['Calendar.Events.list: Rate Limit Exceeded']
          }),
          getDailyData: async () => { fetches += 1; throw new Error('network down'); }
        }
      });
      await captureConsoleError(async () => { await vm.runDailyRangePrefetch(CENTER); });
      const e = entry(vm, 'prefetch-range');
      assert.ok(e, 'prefetch warning filed in the tray');
      assert.match(e.message, /Rate Limit Exceeded/);
      assert.equal(c.cache.getCached(DAY), null, 'a failed calendar read is never cached as a clean sync');

      vm.selectedDate = DAY;
      await captureConsoleError(async () => { await vm.loadDayData(); });
      assert.equal(fetches, 1, 'opening the day fetches it');
      const load = entry(vm, `load-day:${DAY}`);
      assert.equal(load.kind, 'error', 'no offline copy presented as synced');
      assert.doesNotMatch(load.message, /offline copy/);
    });

    it('a later clean window prefetch primes the day and resolves the prefetch entry', async () => {
      const CENTER = '2027-04-10';
      const DAY = '2027-04-12';
      let warnings = ['Tasks.Tasks.list: backend error'];
      const vm = dailyVm(c, {
        date: CENTER,
        bridge: { getDailyDataRange: async () => ({ days: { [DAY]: dayData([{ id: 'x', title: 'x', status: '•' }]) }, warnings }) }
      });
      await captureConsoleError(async () => { await vm.runDailyRangePrefetch(CENTER); });
      assert.ok(entry(vm, 'prefetch-range'));
      assert.equal(c.cache.getCached(DAY), null);
      warnings = [];
      await vm.runDailyRangePrefetch(CENTER);
      assert.equal(entry(vm, 'prefetch-range'), null, 'auto-resolved by the clean prefetch');
      assert.deepEqual(ids(c.cache.getCached(DAY).tasks), ['x']);
      assert.ok(c.cache.getCached(DAY).syncedAt, 'clean range read stamped as synced');
    });

    it('month load with warnings files load-month:<y>-<m> and caches nothing; a clean reload resolves it', async () => {
      const DAY = '2027-06-03';
      let warnings = ['getDailyDataRange Calendar.Events.list: quota'];
      const vm = dailyVm(c, {
        date: '2027-06-20',
        bridge: { getDailyDataRange: async () => ({ days: { [DAY]: dayData([]) }, warnings }) }
      });
      vm.activeView = 'monthly-calendar';
      await captureConsoleError(async () => { await vm.loadMonthlyCalendarData(); });
      const e = entry(vm, 'load-month:2027-6');
      assert.ok(e, 'month warning filed');
      assert.match(e.message, /quota/);
      assert.equal(c.cache.getCached(DAY), null);
      warnings = [];
      await vm.loadMonthlyCalendarData();
      assert.equal(entry(vm, 'load-month:2027-6'), null);
      assert.ok(c.cache.getCached(DAY));
    });
  });

  describe(`(e) per-date note debounce [${c.label}]`, () => {
    it('typing on day A then day B inside the debounce window saves both days with their own text', async () => {
      const A = '2027-03-01';
      const B = '2027-03-02';
      const saved = [];
      const vm = dailyVm(c, {
        date: A,
        bridge: { saveDailyDocCards: async (d, text) => { saved.push([d, text]); return { success: true }; } }
      });
      c.cache.setCached(B, dayData([]));
      vm.dailyNote = 'note A';
      vm.scheduleDailyNoteSave();
      vm.selectedDate = B;
      vm.dailyNote = 'note B';
      vm.scheduleDailyNoteSave();
      assert.equal(vm.reconcileReloadedNote(A, 'server A', vm.saveQueue.mark()).text, 'note A',
        'A is still debouncing: a reload of A keeps the typed text');
      await settle();
      assert.deepEqual(saved.slice().sort(), [[A, 'note A'], [B, 'note B']]);
      assert.equal(c.cache.getCached(A).noteContent, 'note A');
      assert.equal(c.cache.getCached(B).noteContent, 'note B');
    });
  });

  describe(`(f) task delete / title / star through the save queue [${c.label}]`, () => {
    const live = (vm, id) => vm.dailyTasks.find((t) => t.id === id);

    it('delete while a status save is in flight: queued status dropped, reloads never resurrect, item stays deleted', async () => {
      const D = '2027-05-04';
      const t1 = { id: 't1', title: 'a', status: '•' };
      const t2 = { id: 't2', title: 'b', status: '•' };
      const statusCalls = [];
      const gate = deferred();
      const deleted = [];
      const vm = dailyVm(c, {
        date: D,
        tasks: [t1, t2],
        bridge: {
          updateDailyTask: (d, id, u) => { statusCalls.push(u.status); return gate.promise; },
          deleteDailyTask: async (d, id) => { deleted.push(id); return true; },
          getDailyData: async () => dayData([{ id: 't1', title: 'a', status: '•' }, { id: 't2', title: 'b', status: '•' }])
        }
      });
      const save = vm.setTaskStatus(t1, '✓');
      await settle(2);
      await vm.setTaskStatus(t1, 'X');
      const del = vm.deleteDailyTask(t1);
      await settle(2);
      await vm.loadDayData();
      assert.deepEqual(ids(vm.dailyTasks), ['t2'], 'reload during the pending delete does not resurrect the task');
      assert.deepEqual(ids(c.cache.getCached(D).tasks), ['t2']);
      assert.deepEqual(deleted, [], 'the delete waits for the in-flight status write');
      await captureConsoleError(async () => {
        gate.reject(new Error('late status failure'));
        await save;
        await del;
        await settle();
      });
      assert.deepEqual(statusCalls, ['✓'], 'the queued status was superseded by the delete, never sent');
      assert.deepEqual(deleted, ['t1']);
      assert.deepEqual(ids(vm.dailyTasks), ['t2']);
      assert.deepEqual(ids(c.cache.getCached(D).tasks), ['t2']);
      assert.equal(entry(vm, 'task-status:t1'), null, 'no stale status error left for a deleted task');
      assert.equal(entry(vm, 'task-delete:t1'), null);
      assert.equal(live(vm, 't1'), undefined);
    });

    it('a reload whose read began before the delete confirmed does not resurrect the task', async () => {
      const D = '2027-05-05';
      const t1 = { id: 't1', title: 'a', status: '•' };
      const readGate = deferred();
      const vm = dailyVm(c, {
        date: D,
        tasks: [t1],
        bridge: {
          deleteDailyTask: async () => true,
          getDailyData: () => readGate.promise
        }
      });
      const load = vm.loadDayData();
      await settle(2);
      await vm.deleteDailyTask(t1);
      readGate.resolve(dayData([{ id: 't1', title: 'a', status: '•' }]));
      await load;
      await settle();
      assert.deepEqual(ids(vm.dailyTasks), []);
      assert.deepEqual(ids(c.cache.getCached(D).tasks), []);
    });

    it('failed delete (status save confirmed meanwhile, list reloaded) restores the task on screen and in cache with a tray entry', async () => {
      const D = '2027-05-06';
      const t1 = { id: 't1', title: 'a', status: '•' };
      const t2 = { id: 't2', title: 'b', status: '•' };
      const gate = deferred();
      const vm = dailyVm(c, {
        date: D,
        tasks: [t1, t2],
        bridge: {
          updateDailyTask: () => gate.promise,
          deleteDailyTask: boom('delete 403'),
          getDailyData: async () => dayData([{ id: 't1', title: 'a', status: '•' }, { id: 't2', title: 'b', status: '•' }])
        }
      });
      const save = vm.setTaskStatus(t1, '✓');
      await settle(2);
      const del = vm.deleteDailyTask(t1);
      await settle(2);
      await vm.loadDayData();
      const logs = await captureConsoleError(async () => {
        gate.resolve({ id: 't1', status: '✓' });
        await save;
        await del;
        await settle();
      });
      assert.ok(live(vm, 't1'), 'task restored on screen');
      assert.equal(live(vm, 't1').status, '✓', 'restored with its confirmed status');
      assert.ok(c.cache.getCached(D).tasks.some((t) => t.id === 't1'), 'task restored in cache');
      assert.match(entry(vm, 'task-delete:t1').message, /delete 403/);
      assert.ok(logs.some((l) => l.includes('delete 403') && l.includes('at ')), 'stack logged');
    });

    it('reload during a pending title edit keeps the edit on screen; cache holds only the confirmed title until it lands', async () => {
      const D = '2027-05-07';
      const t1 = { id: 't1', title: '[A1] Old', status: '•', notes: '' };
      const gate = deferred();
      const vm = dailyVm(c, {
        date: D,
        tasks: [t1],
        bridge: {
          updateDailyTask: () => gate.promise,
          getDailyData: async () => dayData([{ id: 't1', title: '[A1] Old', status: '•', notes: '' }])
        }
      });
      vm.editingTaskId = 't1';
      const p = vm.updateTaskTitle('t1', 'New');
      await settle(2);
      const edited = t1.title;
      assert.notEqual(edited, '[A1] Old');
      await vm.loadDayData();
      assert.equal(live(vm, 't1').title, edited, 'pending title edit survives the reload');
      assert.equal(c.cache.getCached(D).tasks[0].title, '[A1] Old', 'unconfirmed title never cached');
      gate.resolve({ id: 't1', title: edited });
      await p;
      await settle();
      assert.equal(live(vm, 't1').title, edited);
      assert.equal(c.cache.getCached(D).tasks[0].title, edited);
    });

    it('a failed title edit after a reload rolls back the task on screen and reports task-title:<id>', async () => {
      const D = '2027-05-08';
      const t1 = { id: 't1', title: '[A1] Old', status: '•', notes: '' };
      const gate = deferred();
      const vm = dailyVm(c, {
        date: D,
        tasks: [t1],
        bridge: {
          updateDailyTask: () => gate.promise,
          getDailyData: async () => dayData([{ id: 't1', title: '[A1] Old', status: '•', notes: '' }])
        }
      });
      vm.editingTaskId = 't1';
      const p = vm.updateTaskTitle('t1', 'New');
      await settle(2);
      vm.selectedDate = '2027-05-09';
      await vm.loadDayData();
      vm.selectedDate = D;
      await vm.loadDayData();
      await captureConsoleError(async () => { gate.reject(new Error('patch 500')); await p; await settle(); });
      assert.equal(live(vm, 't1').title, '[A1] Old');
      assert.equal(c.cache.getCached(D).tasks[0].title, '[A1] Old');
      assert.match(entry(vm, 'task-title:t1').message, /patch 500/);
    });

    it('reload during a pending star toggle keeps the star; a later failure rolls it back with a tray entry', async () => {
      const D = '2027-05-10';
      const t1 = { id: 't1', title: 'a', status: '•', starred: false };
      const gate = deferred();
      const vm = dailyVm(c, {
        date: D,
        tasks: [t1],
        bridge: {
          updateDailyTask: () => gate.promise,
          getDailyData: async () => dayData([{ id: 't1', title: 'a', status: '•', starred: false }])
        }
      });
      const p = vm.toggleTaskStar(t1);
      await settle(2);
      await vm.loadDayData();
      assert.equal(live(vm, 't1').starred, true, 'pending star survives the reload');
      assert.equal(c.cache.getCached(D).tasks[0].starred, false, 'unconfirmed star never cached');
      await captureConsoleError(async () => { gate.reject(new Error('star 503')); await p; await settle(); });
      assert.equal(live(vm, 't1').starred, false);
      assert.match(entry(vm, 'task-star:t1').message, /star 503/);
    });

    it('master delete while a status save is in flight: a master reload never resurrects it', async () => {
      const m1 = { id: 'm1', title: '[A1] x', status: '•', category: 'General' };
      const gate = deferred();
      const deleted = [];
      const vm = dailyVm(c, {
        date: '2027-05-11',
        master: [m1],
        bridge: {
          updateMasterTask: () => gate.promise,
          deleteMasterTask: async (id) => { deleted.push(id); return true; },
          getMasterTasks: async () => [{ id: 'm1', title: '[A1] x', status: '•', category: 'General' }]
        }
      });
      const save = vm.setTaskStatus(m1, '✓');
      await settle(2);
      const del = vm.deleteMasterTask(m1);
      await settle(2);
      await vm.loadMasterTasks();
      assert.deepEqual(ids(vm.masterTasks), []);
      gate.resolve({ id: 'm1', status: '✓' });
      await save;
      await del;
      await settle();
      assert.deepEqual(deleted, ['m1']);
      assert.deepEqual(ids(vm.masterTasks), []);
      assert.deepEqual(ids(c.cache.getCachedMasterTasks().tasks), []);
    });
  });

  describe(`(g) caches hold only confirmed values for other tasks [${c.label}]`, () => {
    it('task B confirming does not cache task A pending status; A failure leaves A confirmed value', async () => {
      const D = '2027-07-01';
      const tA = { id: 'tA', title: 'a', status: '•' };
      const tB = { id: 'tB', title: 'b', status: '•' };
      const gateA = deferred();
      const vm = dailyVm(c, {
        date: D,
        tasks: [tA, tB],
        bridge: { updateDailyTask: (d, id, u) => (id === 'tA' ? gateA.promise : Promise.resolve({ id, status: u.status })) }
      });
      const saveA = vm.setTaskStatus(tA, '✓');
      await settle(2);
      await vm.setTaskStatus(tB, 'X');
      await settle();
      const cached = () => c.cache.getCached(D).tasks;
      assert.equal(cached().find((t) => t.id === 'tB').status, 'X', 'B confirmed and cached');
      assert.equal(cached().find((t) => t.id === 'tA').status, '•', 'A pending status not cached');
      assert.equal(tA.status, '✓', 'A pending status still on screen');
      await captureConsoleError(async () => { gateA.reject(new Error('A failed')); await saveA; await settle(); });
      assert.equal(cached().find((t) => t.id === 'tA').status, '•');
      assert.equal(cached().find((t) => t.id === 'tB').status, 'X');
    });

    it('master list: B confirming does not cache A pending master status', async () => {
      const mA = { id: 'mA', title: '[A1] a', status: '•', category: 'General' };
      const mB = { id: 'mB', title: '[A2] b', status: '•', category: 'General' };
      const gateA = deferred();
      const vm = dailyVm(c, {
        date: '2027-07-02',
        master: [mA, mB],
        bridge: { updateMasterTask: (id, u) => (id === 'mA' ? gateA.promise : Promise.resolve({ id, status: u.status })) }
      });
      const saveA = vm.setTaskStatus(mA, '✓');
      await settle(2);
      await vm.setTaskStatus(mB, 'X');
      await settle();
      const cached = () => c.cache.getCachedMasterTasks().tasks;
      assert.equal(cached().find((t) => t.id === 'mB').status, 'X');
      assert.equal(cached().find((t) => t.id === 'mA').status, '•');
      gateA.resolve({ id: 'mA', status: '✓' });
      await saveA;
      await settle();
      assert.equal(cached().find((t) => t.id === 'mA').status, '✓');
    });
  });

  describe(`(h) reload merge never stamps an unsaved note as synced [${c.label}]`, () => {
    it('note save in flight: the merge keeps the typed text in cache but does not refresh syncedAt', async () => {
      const D = '2027-08-01';
      const gate = deferred();
      const vm = dailyVm(c, {
        date: D,
        bridge: {
          getDailyData: async () => dayData([], { noteContent: 'v1' }),
          saveDailyDocCards: () => gate.promise
        }
      });
      await vm.loadDayData();
      c.cache.setCached(D, { ...c.cache.getCached(D), syncedAt: 1000 });
      vm.dailyNote = 'v2';
      vm.scheduleDailyNoteSave();
      await settle(3);
      await vm.loadDayData();
      assert.equal(c.cache.getCached(D).noteContent, 'v2');
      assert.equal(c.cache.getCached(D).syncedAt, 1000, 'unsaved note never stamped as a fresh sync');
      gate.resolve({ success: true });
      await settle();
      assert.equal(c.cache.getCached(D).noteContent, 'v2');
    });

    it('note still debouncing: the merge does not stamp synced either', async () => {
      const D = '2027-08-02';
      const vm = dailyVm(c, {
        date: D,
        bridge: {
          getDailyData: async () => dayData([], { noteContent: 'v1' }),
          saveDailyDocCards: async () => ({ success: true })
        }
      });
      await vm.loadDayData();
      c.cache.setCached(D, { ...c.cache.getCached(D), syncedAt: 1000 });
      vm.dailyNote = 'v2';
      vm.scheduleDailyNoteSave();
      const load = vm.loadDayData();
      await load;
      assert.equal(c.cache.getCached(D).noteContent, 'v2');
      assert.equal(c.cache.getCached(D).syncedAt, 1000);
      await settle();
    });

    it('a clean merge (no unsaved note) still stamps synced', async () => {
      const D = '2027-08-03';
      const vm = dailyVm(c, { date: D, bridge: { getDailyData: async () => dayData([], { noteContent: 'v1' }) } });
      c.cache.setCached(D, { ...c.cache.getCached(D), syncedAt: 1000 });
      await vm.loadDayData();
      assert.ok(c.cache.getCached(D).syncedAt > 1000);
    });
  });
}
