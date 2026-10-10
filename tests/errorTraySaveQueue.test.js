/**
 * @file errorTraySaveQueue.test.js
 * @description Keyed error tray, per-item save serialization (latest value wins, rollback to the
 * last server-confirmed value), forward-failure re-fetch, and saveNewEvent -> createCalendarEvent.
 * Every case runs against BOTH client copies (src/app.js and gas-app/Script.html) through
 * tests/helpers/plannerHarness.js, so a change landing in only one file fails here.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, loadScriptHtml, makeVm, settle, captureConsoleError } from './helpers/plannerHarness.js';
import { GASBridge } from '../src/gasBridge.js';
import { createSaveQueue } from '../src/saveGuard.js';

const DATE = '2026-10-09';

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

function dailyVm(c, { date = DATE, tasks = [], master = [], bridge = {}, note = '' } = {}) {
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

/** Bridge whose updateDailyTask calls each hang until the test settles them, in order. */
function gatedStatusBridge() {
  const calls = [];
  const gates = [];
  return {
    calls,
    gates,
    bridge: {
      updateDailyTask: (d, id, u) => {
        calls.push(u.status);
        const g = deferred();
        gates.push(g);
        return g.promise;
      }
    }
  };
}

const clients = await bothClients({ exportNames: ['GASBridge', 'window', 'dpCreateSaveQueue'] });

function queueFactory(c) {
  return c.scope ? c.scope.dpCreateSaveQueue : createSaveQueue;
}

for (const c of clients) {
  describe(`save queue reconcile with a server read [${c.label}]`, () => {
    it('keeps the local value while a write is in flight and adopts the server copy as the rollback target', async () => {
      const q = queueFactory(c)();
      const gate = deferred();
      let rolledBackTo;
      const p = q.submit('k', { value: 'B', baseline: 'A', write: () => gate.promise, onFailed: (err, confirmed) => { rolledBackTo = confirmed; } });
      const mark = q.mark();
      const r = q.reconcile('k', 'S', mark);
      assert.equal(r.keepLocal, true);
      assert.equal(r.confirmed, 'S');
      gate.reject(new Error('write failed'));
      await p;
      assert.equal(rolledBackTo, 'S');
    });

    it('does not keep the local value of a key whose failure handler is running (its own rollback re-read)', async () => {
      const q = queueFactory(c)();
      let seen;
      await q.submit('k', {
        value: 'B',
        baseline: 'A',
        write: boom('failed'),
        onFailed: () => { seen = q.reconcile('k', 'S', q.mark()); }
      });
      assert.equal(seen.keepLocal, false);
      assert.equal(seen.confirmed, 'S');
    });

    it('a value submitted and confirmed after the read began stays on screen and stays the confirmed value', async () => {
      const q = queueFactory(c)();
      const mark = q.mark();
      await q.submit('k', { value: 'B', baseline: 'A', write: async () => ({ ok: true }) });
      const r = q.reconcile('k', 'A-old-read', mark);
      assert.equal(r.keepLocal, true);
      assert.equal(r.confirmed, 'B');
    });

    it('a write in flight when the read began that confirms before the read returns keeps local (the read may predate it)', async () => {
      const q = queueFactory(c)();
      const gate = deferred();
      const p = q.submit('k', { value: 'B', baseline: 'A', write: () => gate.promise });
      const mark = q.mark();
      gate.resolve({ ok: true });
      await p;
      const r = q.reconcile('k', 'A-old-read', mark);
      assert.equal(r.keepLocal, true);
      assert.equal(r.confirmed, 'B');
    });

    it('an unknown key takes the server copy; a null mark (cached copy, not a server read) never adopts it', async () => {
      const q = queueFactory(c)();
      assert.deepEqual({ ...q.reconcile('none', 'S', q.mark()) }, { keepLocal: false, confirmed: 'S' });
      const gate = deferred();
      let rolledBackTo;
      const p = q.submit('k', { value: 'B', baseline: 'A', write: () => gate.promise, onFailed: (err, confirmed) => { rolledBackTo = confirmed; } });
      assert.equal(q.reconcile('k', 'C', null).keepLocal, true);
      gate.reject(new Error('x'));
      await p;
      assert.equal(rolledBackTo, 'A');
    });
  });

  describe(`full-day reloads never clobber unsaved saves [${c.label}]`, () => {
    const live = (vm, id) => vm.dailyTasks.find((t) => t.id === id);

    it('forward-failure re-fetch keeps another task in-flight status on screen; its later failure rolls back to the server copy', async () => {
      const SRC = '2031-09-10';
      const t1 = { id: 't1', title: 'a', status: '•' };
      const t2 = { id: 't2', title: 'b', status: '•' };
      const t2Gate = deferred();
      const vm = dailyVm(c, {
        date: SRC,
        tasks: [t1, t2],
        bridge: {
          forwardDailyTask: boom('Nothing was forwarded: the target copy could not be created.'),
          updateDailyTask: () => t2Gate.promise,
          getDailyData: async () => dayData([{ id: 't1', title: 'a', status: '•' }, { id: 't2', title: 'b-server', status: 'X' }])
        }
      });
      const t2Save = vm.setTaskStatus(t2, '✓');
      await settle(2);
      await captureConsoleError(async () => { await vm.setTaskStatus(t1, '→'); await settle(); });
      assert.equal(live(vm, 't2').status, '✓', 'pending pick stays on screen');
      assert.equal(live(vm, 't2').title, 'b-server', 'fields without a pending save take the server copy');
      assert.equal(live(vm, 't1').status, '•');
      assert.equal(c.cache.getCached(SRC).tasks.find((t) => t.id === 't2').status, 'X', 'cache holds only the server-confirmed value');
      await captureConsoleError(async () => { t2Gate.reject(new Error('t2 failed')); await t2Save; await settle(); });
      assert.equal(live(vm, 't2').status, 'X', 'rollback goes to the server copy, not the pre-pick value');
      assert.equal(c.cache.getCached(SRC).tasks.find((t) => t.id === 't2').status, 'X');
    });

    it('statuses picked while the re-fetch is in flight (one confirmed, one still saving) are not clobbered', async () => {
      const SRC = '2031-09-11';
      const t1 = { id: 't1', title: 'a', status: '•' };
      const t2 = { id: 't2', title: 'b', status: '•' };
      const t3 = { id: 't3', title: 'c', status: '•' };
      const refetchGate = deferred();
      const t3Gate = deferred();
      const vm = dailyVm(c, {
        date: SRC,
        tasks: [t1, t2, t3],
        bridge: {
          forwardDailyTask: boom('Nothing was forwarded: the target copy could not be created.'),
          updateDailyTask: (d, id, u) => (id === 't3' ? t3Gate.promise : Promise.resolve({ id, status: u.status })),
          getDailyData: () => refetchGate.promise
        }
      });
      let t3Save;
      await captureConsoleError(async () => {
        const fwd = vm.setTaskStatus(t1, '→');
        await settle(3);
        await vm.setTaskStatus(t2, '✓');
        t3Save = vm.setTaskStatus(t3, 'X');
        await settle(3);
        refetchGate.resolve(dayData([
          { id: 't1', title: 'a', status: '•' }, { id: 't2', title: 'b', status: '•' }, { id: 't3', title: 'c', status: '•' }
        ]));
        await fwd;
        await settle();
      });
      assert.equal(live(vm, 't2').status, '✓', 'pick confirmed during the re-fetch survives the older read');
      assert.equal(live(vm, 't3').status, 'X', 'pick still saving survives');
      const cached = c.cache.getCached(SRC).tasks;
      assert.equal(cached.find((t) => t.id === 't2').status, '✓', 'confirmed pick stays cached');
      assert.equal(cached.find((t) => t.id === 't3').status, '•', 'unconfirmed pick never cached');
      t3Gate.resolve({ id: 't3', status: 'X' });
      await t3Save;
      await settle();
      assert.equal(c.cache.getCached(SRC).tasks.find((t) => t.id === 't3').status, 'X');
    });

    it('loadDayData (cache apply and server apply) keeps an in-flight status save on screen', async () => {
      const t1 = { id: 't1', title: 'a', status: '•' };
      const gate = deferred();
      const vm = dailyVm(c, {
        tasks: [t1],
        bridge: { updateDailyTask: () => gate.promise, getDailyData: async () => dayData([{ id: 't1', title: 'a', status: '•' }]) }
      });
      const save = vm.setTaskStatus(t1, '✓');
      await settle(2);
      await vm.loadDayData();
      assert.equal(live(vm, 't1').status, '✓');
      assert.equal(c.cache.getCached(DATE).tasks[0].status, '•');
      gate.resolve({ id: 't1', status: '✓' });
      await save;
      await settle();
      assert.equal(live(vm, 't1').status, '✓');
      assert.equal(c.cache.getCached(DATE).tasks[0].status, '✓');
    });

    it('navigating away and back mid-save shows the pending value, and a failure then rolls back the task on screen', async () => {
      const OTHER = '2026-10-10';
      const t1 = { id: 't1', title: 'a', status: '•' };
      const gate = deferred();
      const vm = dailyVm(c, {
        tasks: [t1],
        bridge: {
          updateDailyTask: () => gate.promise,
          getDailyData: async (d) => dayData(d === DATE ? [{ id: 't1', title: 'a', status: '•' }] : [])
        }
      });
      const save = vm.setTaskStatus(t1, '✓');
      await settle(2);
      vm.selectedDate = OTHER;
      await vm.loadDayData();
      vm.selectedDate = DATE;
      await vm.loadDayData();
      assert.equal(live(vm, 't1').status, '✓');
      await captureConsoleError(async () => { gate.reject(new Error('Tasks API 503')); await save; await settle(); });
      assert.equal(live(vm, 't1').status, '•', 'the on-screen copy is rolled back, not only the detached original');
      assert.match(entry(vm, 'task-status:t1').message, /Tasks API 503/);
    });

    it('loadDayData keeps an in-flight note save in the editor and cache; its failure rolls back to the server text', async () => {
      const gates = [];
      const vm = dailyVm(c, {
        bridge: {
          getDailyData: async () => dayData([], { noteContent: 'v1' }),
          saveDailyDocCards: () => { const g = deferred(); gates.push(g); return g.promise; }
        }
      });
      await vm.loadDayData();
      vm.dailyNote = 'v2';
      vm.scheduleDailyNoteSave();
      await settle(3);
      assert.equal(gates.length, 1, 'save in flight');
      await vm.loadDayData();
      assert.equal(vm.dailyNote, 'v2');
      assert.equal(c.cache.getCached(DATE).noteContent, 'v2');
      await captureConsoleError(async () => { gates[0].reject(new Error('Drive 500')); await settle(); });
      assert.equal(vm.dailyNote, 'v2', 'editor text kept');
      assert.equal(c.cache.getCached(DATE).noteContent, 'v1', 'cache rolled back to the server text');
      assert.ok(entry(vm, `save-note:${DATE}`));
    });

    it('loadMasterTasks keeps an in-flight master status save on screen', async () => {
      const m1 = { id: 'm1', title: '[A1] x', status: '•', category: 'General' };
      const gate = deferred();
      const vm = dailyVm(c, {
        master: [m1],
        bridge: { updateMasterTask: () => gate.promise, getMasterTasks: async () => [{ id: 'm1', title: '[A1] x', status: '•', category: 'General' }] }
      });
      const save = vm.setTaskStatus(m1, '✓');
      await settle(2);
      await vm.loadMasterTasks();
      assert.equal(vm.masterTasks.find((t) => t.id === 'm1').status, '✓');
      gate.resolve({ id: 'm1', status: '✓' });
      await save;
      await settle();
      assert.equal(vm.masterTasks.find((t) => t.id === 'm1').status, '✓');
    });
  });

  describe(`offline-copy notices for days not viewed [${c.label}]`, () => {
    it('navigating away resolves the left day stale notice; other entries and the new day notice survive', async () => {
      const OTHER = '2026-10-10';
      const vm = dailyVm(c, { bridge: { getDailyData: boom('network down') } });
      c.cache.setCached(OTHER, dayData([]));
      await captureConsoleError(async () => { await vm.loadDayData(); });
      assert.equal(entry(vm, `load-day:${DATE}`).kind, 'stale');
      vm.reportError('task-status:x', 'Could not save task status: quota');
      vm.selectedDate = OTHER;
      await captureConsoleError(async () => { await vm.loadDayData(); });
      assert.equal(entry(vm, `load-day:${DATE}`), null);
      assert.equal(entry(vm, `load-day:${OTHER}`).kind, 'stale');
      assert.ok(entry(vm, 'task-status:x'));
    });

    it('a successful re-fetch of a day resolves its load-day notice', async () => {
      const SRC = '2031-10-10';
      const task = { id: 't7', title: 'g', status: '•' };
      let fail = true;
      const vm = dailyVm(c, {
        date: SRC,
        tasks: [task],
        bridge: {
          forwardDailyTask: boom('Nothing was forwarded: the target copy could not be created.'),
          getDailyData: async () => { if (fail) throw new Error('network down'); return dayData([{ id: 't7', title: 'g', status: '•' }]); }
        }
      });
      await captureConsoleError(async () => { await vm.loadDayData(); });
      assert.ok(entry(vm, `load-day:${SRC}`));
      fail = false;
      await captureConsoleError(async () => { await vm.setTaskStatus(vm.dailyTasks[0], '→'); await settle(); });
      assert.equal(entry(vm, `load-day:${SRC}`), null);
    });
  });

  describe(`keyed error tray [${c.label}]`, () => {
    it('same key replaces its entry; newest first; max 3 visible plus a hidden count; dismiss removes one', () => {
      const vm = dailyVm(c);
      vm.reportError('a', 'first');
      vm.reportError('b', 'second');
      vm.reportError('a', 'first again');
      assert.deepEqual(vm.orderedErrors.map((e) => [e.key, e.message]), [['a', 'first again'], ['b', 'second']]);
      vm.reportError('c', 'third');
      vm.reportError('d', 'fourth');
      vm.reportError('e', 'fifth');
      assert.deepEqual(vm.visibleErrors.map((e) => e.key), ['e', 'd', 'c']);
      assert.equal(vm.hiddenErrorCount, 2);
      vm.errorTrayExpanded = true;
      assert.deepEqual(vm.visibleErrors.map((e) => e.key), ['e', 'd', 'c', 'a', 'b']);
      assert.equal(vm.hiddenErrorCount, 0);
      vm.dismissError('d');
      assert.equal(entry(vm, 'd'), null);
      assert.equal(vm.errorMessage, 'fifth');
    });

    it('errorMessage is null when the tray is empty', () => {
      const vm = dailyVm(c);
      assert.equal(vm.errorMessage, null);
      assert.deepEqual(vm.errorTray, []);
    });

    it('a real failure outranks a newer stale/offline notice', () => {
      const vm = dailyVm(c);
      vm.reportError('save-note:x', 'note NOT saved');
      vm.reportError('load-master', 'offline copy', { kind: 'stale' });
      assert.deepEqual(vm.orderedErrors.map((e) => e.key), ['save-note:x', 'load-master']);
    });

    it('sync failure is keyed "sync" with a Retry; sync success clears only sync* keys', async () => {
      const vm = dailyVm(c);
      vm.reportError('task-status:t9', 'Could not save task status: quota');
      vm.reportError('sync-calendar', 'old sync warning');
      vm.buildScheduleGrid = () => { throw new Error('grid exploded'); };
      await captureConsoleError(async () => { await vm.trigger2WaySync(); });
      const syncEntry = entry(vm, 'sync');
      assert.ok(syncEntry, 'sync entry registered');
      assert.match(syncEntry.message, /grid exploded/);
      assert.equal(typeof syncEntry.retry, 'function');
      vm.buildScheduleGrid = () => {};
      await vm.retryError('sync');
      assert.equal(entry(vm, 'sync'), null);
      assert.equal(entry(vm, 'sync-calendar'), null);
      assert.ok(entry(vm, 'task-status:t9'), 'non-sync entries survive a sync success');
    });

    it('note save failure is keyed save-note:<date> with a Retry that saves the latest text and resolves it', async () => {
      let fail = true;
      const saved = [];
      const vm = dailyVm(c, {
        bridge: {
          getDailyData: async () => dayData([], { noteContent: 'saved v1' }),
          saveDailyDocCards: async (d, text) => {
            if (fail) throw new Error('Drive quota exceeded');
            saved.push([d, text]);
            return { success: true };
          }
        }
      });
      await vm.loadDayData();
      vm.dailyNote = 'typed v2';
      await captureConsoleError(async () => { vm.scheduleDailyNoteSave(); await settle(); });
      const e = entry(vm, `save-note:${DATE}`);
      assert.ok(e, 'keyed note entry');
      assert.match(e.message, /Drive quota exceeded/);
      assert.equal(typeof e.retry, 'function');
      fail = false;
      vm.selectedDate = '2026-10-10'; // retry must not read the currently open day
      vm.dailyNote = 'other day text';
      await vm.retryError(`save-note:${DATE}`);
      await settle();
      assert.deepEqual(saved, [[DATE, 'typed v2']]);
      assert.equal(entry(vm, `save-note:${DATE}`), null);
      assert.equal(c.cache.getCached(DATE).noteContent, 'typed v2');
    });

    it('a later successful note save auto-resolves the save-note entry', async () => {
      let fail = true;
      const vm = dailyVm(c, {
        bridge: {
          getDailyData: async () => dayData([], { noteContent: 'v1' }),
          saveDailyDocCards: async () => { if (fail) throw new Error('offline'); return { success: true }; }
        }
      });
      await vm.loadDayData();
      vm.dailyNote = 'v2';
      await captureConsoleError(async () => { vm.scheduleDailyNoteSave(); await settle(); });
      assert.ok(entry(vm, `save-note:${DATE}`));
      fail = false;
      vm.dailyNote = 'v3';
      vm.scheduleDailyNoteSave();
      await settle();
      assert.equal(entry(vm, `save-note:${DATE}`), null);
    });

    it('task status failure is keyed task-status:<id> with a Retry; a later success resolves it', async () => {
      let fail = true;
      const task = { id: 't1', title: '[A1] Call vendor', status: '•' };
      const vm = dailyVm(c, {
        tasks: [task],
        bridge: { updateDailyTask: async (d, id, u) => { if (fail) throw new Error('Tasks API 503'); return { id, status: u.status }; } }
      });
      await captureConsoleError(async () => { await vm.setTaskStatus(task, '✓'); await settle(); });
      const e = entry(vm, 'task-status:t1');
      assert.ok(e);
      assert.match(e.message, /Tasks API 503/);
      assert.equal(task.status, '•');
      fail = false;
      await vm.retryError('task-status:t1');
      await settle();
      assert.equal(task.status, '✓');
      assert.equal(c.cache.getCached(DATE).tasks[0].status, '✓');
      assert.equal(entry(vm, 'task-status:t1'), null);
    });

    it('stale-cache notices are keyed entries (load-day:<date>, load-master) resolved by the next success', async () => {
      let fail = false;
      const vm = dailyVm(c, {
        bridge: {
          getDailyData: async () => { if (fail) throw new Error('network down'); return dayData([], { noteContent: 'n' }); },
          getMasterTasks: async () => { if (fail) throw new Error('network down'); return []; }
        }
      });
      await vm.loadDayData();
      await vm.loadMasterTasks();
      fail = true;
      await captureConsoleError(async () => { await vm.loadDayData(); await vm.loadMasterTasks(); });
      assert.match(entry(vm, `load-day:${DATE}`).message, /offline copy \(last synced/);
      assert.equal(entry(vm, `load-day:${DATE}`).kind, 'stale');
      assert.match(entry(vm, 'load-master').message, /Master Tasks/);
      fail = false;
      await vm.loadDayData();
      await vm.loadMasterTasks();
      assert.equal(entry(vm, `load-day:${DATE}`), null);
      assert.equal(entry(vm, 'load-master'), null);
    });
  });

  describe(`per-item save serialization [${c.label}]`, () => {
    it('A->B->C where B fails and C fails: UI and cache show A; writes never overlap', async () => {
      const task = { id: 't1', title: '[A1] Call vendor', status: '•' };
      const g = gatedStatusBridge();
      const vm = dailyVm(c, { tasks: [task], bridge: g.bridge });
      await captureConsoleError(async () => {
        const first = vm.setTaskStatus(task, '✓');
        await settle(2);
        await vm.setTaskStatus(task, 'X');
        assert.equal(task.status, 'X', 'optimistic latest value shown');
        assert.deepEqual(g.calls, ['✓'], 'C waits for B (same item key)');
        g.gates[0].reject(new Error('B failed'));
        await settle(2);
        assert.equal(task.status, 'X', 'B failing while C is queued leaves the UI alone');
        assert.deepEqual(g.calls, ['✓', 'X']);
        g.gates[1].reject(new Error('C failed'));
        await first;
        await settle();
      });
      assert.equal(task.status, '•');
      assert.equal(c.cache.getCached(DATE).tasks[0].status, '•');
      assert.match(entry(vm, 'task-status:t1').message, /C failed/);
    });

    it('A->B->C where B succeeds and C fails: UI and cache show B (the last confirmed value)', async () => {
      const task = { id: 't1', title: '[A1] Call vendor', status: '•' };
      const g = gatedStatusBridge();
      const vm = dailyVm(c, { tasks: [task], bridge: g.bridge });
      await captureConsoleError(async () => {
        const first = vm.setTaskStatus(task, '✓');
        await settle(2);
        await vm.setTaskStatus(task, 'X');
        g.gates[0].resolve({ id: 't1', status: '✓' });
        await settle(2);
        assert.equal(c.cache.getCached(DATE).tasks[0].status, '•', 'unconfirmed C never cached while it is in flight');
        g.gates[1].reject(new Error('C failed'));
        await first;
        await settle();
      });
      assert.equal(task.status, '✓');
      assert.equal(c.cache.getCached(DATE).tasks[0].status, '✓');
      assert.match(entry(vm, 'task-status:t1').message, /C failed/);
    });

    it('A->B->C where B fails and C succeeds: shows C with no error entry', async () => {
      const task = { id: 't1', title: '[A1] Call vendor', status: '•' };
      const g = gatedStatusBridge();
      const vm = dailyVm(c, { tasks: [task], bridge: g.bridge });
      await captureConsoleError(async () => {
        const first = vm.setTaskStatus(task, '✓');
        await settle(2);
        await vm.setTaskStatus(task, 'X');
        g.gates[0].reject(new Error('B failed'));
        await settle(2);
        g.gates[1].resolve({ id: 't1', status: 'X' });
        await first;
        await settle();
      });
      assert.equal(task.status, 'X');
      assert.equal(c.cache.getCached(DATE).tasks[0].status, 'X');
      assert.equal(entry(vm, 'task-status:t1'), null);
    });

    it('superseded intermediate values are skipped: B in flight, then C and D queued => sends B then D', async () => {
      const task = { id: 't1', title: '[A1] Call vendor', status: '•' };
      const g = gatedStatusBridge();
      const vm = dailyVm(c, { tasks: [task], bridge: g.bridge });
      const first = vm.setTaskStatus(task, '✓');
      await settle(2);
      await vm.setTaskStatus(task, 'X');
      await vm.setTaskStatus(task, 'Ⓓ');
      g.gates[0].resolve({ id: 't1', status: '✓' });
      await settle(2);
      g.gates[1].resolve({ id: 't1', status: 'Ⓓ' });
      await first;
      await settle();
      assert.deepEqual(g.calls, ['✓', 'Ⓓ']);
      assert.equal(task.status, 'Ⓓ');
    });

    it('note saves for the same date never overlap and the latest text wins', async () => {
      const gates = [];
      const sent = [];
      let inFlight = 0;
      let maxInFlight = 0;
      const vm = dailyVm(c, {
        bridge: {
          getDailyData: async () => dayData([], { noteContent: 'v1' }),
          saveDailyDocCards: (d, text) => {
            sent.push(text);
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            const g = deferred();
            gates.push(g);
            return g.promise.then((r) => { inFlight -= 1; return r; });
          }
        }
      });
      await vm.loadDayData();
      vm.dailyNote = 'v2';
      vm.scheduleDailyNoteSave();
      await settle(3);
      vm.dailyNote = 'v3';
      vm.scheduleDailyNoteSave();
      await settle(3);
      vm.dailyNote = 'v4';
      vm.scheduleDailyNoteSave();
      await settle(3);
      assert.deepEqual(sent, ['v2'], 'later saves wait for the in-flight one');
      gates[0].resolve({ success: true });
      await settle(3);
      gates[1].resolve({ success: true });
      await settle();
      assert.equal(maxInFlight, 1);
      assert.deepEqual(sent, ['v2', 'v4']);
      assert.equal(c.cache.getCached(DATE).noteContent, 'v4');
    });
  });

  describe(`forwardDailyTask failure re-fetches server truth [${c.label}]`, () => {
    it('re-fetches the source day and the cached target day, server state wins, message shown as-is', async () => {
      const SRC = '2031-03-10';
      const TGT = '2031-03-11';
      const task = { id: 't1', title: '[A1] Call vendor', status: '•' };
      const fetched = [];
      const vm = dailyVm(c, {
        date: SRC,
        tasks: [task],
        bridge: {
          forwardDailyTask: boom('Forward incomplete: the copy on 2031-03-11 was created but the original could not be updated; the task may be duplicated.'),
          getDailyData: async (d) => {
            fetched.push(d);
            return d === SRC
              ? dayData([{ id: 't1', title: '[A1] Call vendor', status: '→' }])
              : dayData([{ id: 't1-fwd', title: '[A1] Call vendor', status: '•' }]);
          }
        }
      });
      c.cache.setCached(TGT, dayData([]));
      await captureConsoleError(async () => { await vm.setTaskStatus(task, '→'); await settle(); });
      assert.deepEqual(fetched.slice().sort(), [SRC, TGT]);
      assert.deepEqual(vm.dailyTasks.map((t) => [t.id, t.status]), [['t1', '→']]);
      assert.equal(c.cache.getCached(SRC).tasks[0].status, '→');
      assert.deepEqual(c.cache.getCached(TGT).tasks.map((t) => t.id), ['t1-fwd']);
      assert.match(vm.errorMessage || '', /the copy on 2031-03-11 was created but the original could not be updated; the task may be duplicated\./);
      assert.equal(vm.taskToast, null);
    });

    it('does not fetch an uncached target day', async () => {
      const SRC = '2031-04-10';
      const task = { id: 't2', title: 'b', status: '•' };
      const fetched = [];
      const vm = dailyVm(c, {
        date: SRC,
        tasks: [task],
        bridge: {
          forwardDailyTask: boom('forward 500'),
          getDailyData: async (d) => { fetched.push(d); return dayData([{ id: 't2', title: 'b', status: '•' }]); }
        }
      });
      await captureConsoleError(async () => { await vm.setTaskStatus(task, '→'); await settle(); });
      assert.deepEqual(fetched, [SRC]);
      assert.equal(vm.dailyTasks[0].status, '•');
    });

    it('a "may be duplicated" failure reloads the target day even when it was not cached', async () => {
      const SRC = '2031-06-10';
      const TGT = '2031-06-11';
      const task = { id: 't4', title: 'd', status: '•' };
      const fetched = [];
      const vm = dailyVm(c, {
        date: SRC,
        tasks: [task],
        bridge: {
          forwardDailyTask: boom('Could not mark the original as forwarded. The task may be duplicated on 2031-06-11.'),
          getDailyData: async (d) => {
            fetched.push(d);
            return dayData(d === SRC ? [{ id: 't4', title: 'd', status: '•' }] : [{ id: 't4-fwd', title: 'd', status: '•' }]);
          }
        }
      });
      await captureConsoleError(async () => { await vm.setTaskStatus(task, '→'); await settle(); });
      assert.deepEqual(fetched.slice().sort(), [SRC, TGT]);
      assert.deepEqual(c.cache.getCached(TGT).tasks.map((t) => t.id), ['t4-fwd']);
      assert.match(vm.errorMessage || '', /The task may be duplicated on 2031-06-11\./);
    });

    it('a "may be duplicated" forward failure offers no Retry (retrying would create another copy); "Nothing was forwarded" does', async () => {
      const SRC = '2031-07-10';
      const dupTask = { id: 't5', title: 'e', status: '•' };
      const vm = dailyVm(c, {
        date: SRC,
        tasks: [dupTask],
        bridge: {
          forwardDailyTask: boom('Could not mark the original as forwarded. The task may be duplicated on 2031-07-11.'),
          getDailyData: async () => dayData([{ id: 't5', title: 'e', status: '•' }])
        }
      });
      await captureConsoleError(async () => { await vm.setTaskStatus(dupTask, '→'); await settle(); });
      assert.equal(entry(vm, 'task-status:t5').retry, null);

      const SRC2 = '2031-08-10';
      const safeTask = { id: 't6', title: 'f', status: '•' };
      const vm2 = dailyVm(c, {
        date: SRC2,
        tasks: [safeTask],
        bridge: {
          forwardDailyTask: boom('Nothing was forwarded: the target copy could not be created.'),
          getDailyData: async () => dayData([{ id: 't6', title: 'f', status: '•' }])
        }
      });
      await captureConsoleError(async () => { await vm2.setTaskStatus(safeTask, '→'); await settle(); });
      assert.equal(typeof entry(vm2, 'task-status:t6').retry, 'function');
    });

    it('a failed re-fetch is reported in the same entry, keeps the rolled-back state, and logs the stack', async () => {
      const SRC = '2031-05-10';
      const task = { id: 't3', title: 'c', status: '•' };
      const vm = dailyVm(c, {
        date: SRC,
        tasks: [task],
        bridge: { forwardDailyTask: boom('forward 502'), getDailyData: boom('refetch offline') }
      });
      const logs = await captureConsoleError(async () => { await vm.setTaskStatus(task, '→'); await settle(); });
      assert.equal(task.status, '•');
      const e = entry(vm, 'task-status:t3');
      assert.match(e.message, /forward 502/);
      assert.match(e.message, /refetch offline/);
      assert.ok(logs.some((l) => l.includes('refetch offline') && l.includes('at ')), 'refetch stack logged');
    });
  });

  describe(`saveNewEvent -> createCalendarEvent [${c.label}]`, () => {
    const created = {
      id: 'ev1', title: 'Dentist', startTime: '2026-10-09T09:00:00-05:00', endTime: '2026-10-09T10:00:00-05:00',
      location: 'Room 2', description: 'cleaning', meetLink: null, htmlLink: 'h', syncTaskId: null
    };

    function eventVm(bridge) {
      const vm = dailyVm(c, { bridge });
      vm.createEventModalOpen = true;
      vm.newEventData = { title: 'Dentist', startTime: '09:00', endTime: '10:00', location: 'Room 2', description: 'cleaning' };
      return vm;
    }

    it('sends the contract payload, adds the returned event to the day and cache, and closes the modal', async () => {
      const payloads = [];
      const vm = eventVm({ createCalendarEvent: async (p) => { payloads.push(p); return { ...created }; } });
      await vm.saveNewEvent();
      assert.deepEqual(payloads, [{
        title: 'Dentist', dateStr: DATE, startTime: '09:00', endTime: '10:00',
        description: 'cleaning', location: 'Room 2'
      }]);
      assert.deepEqual(vm.calendarEvents.map((e) => e.id), ['ev1']);
      assert.deepEqual(c.cache.getCached(DATE).calendarEvents.map((e) => e.id), ['ev1']);
      assert.equal(vm.createEventModalOpen, false);
      assert.equal(vm.createEventError, null);
    });

    it('on failure keeps the modal open with input intact and the error in-modal; nothing added', async () => {
      const vm = eventVm({ createCalendarEvent: boom('Calendar API 403: insufficient permission') });
      const logs = await captureConsoleError(async () => { await vm.saveNewEvent(); });
      assert.equal(vm.createEventModalOpen, true);
      assert.equal(vm.newEventData.title, 'Dentist');
      assert.equal(vm.newEventData.location, 'Room 2');
      assert.match(vm.createEventError || '', /Calendar API 403: insufficient permission/);
      assert.equal(vm.calendarEvents.length, 0);
      assert.equal(c.cache.getCached(DATE).calendarEvents.length, 0);
      assert.ok(logs.some((l) => l.includes('Calendar API 403') && l.includes('at ')));
    });

    it('treats a null result as not saved', async () => {
      const vm = eventVm({ createCalendarEvent: async () => null });
      await captureConsoleError(async () => { await vm.saveNewEvent(); });
      assert.equal(vm.createEventModalOpen, true);
      assert.match(vm.createEventError || '', /not saved/i);
      assert.equal(vm.calendarEvents.length, 0);
    });

    it('a double submit while the create is in flight sends one request (no duplicate event)', async () => {
      const g = deferred();
      let n = 0;
      const vm = eventVm({ createCalendarEvent: () => { n += 1; return g.promise; } });
      const first = vm.saveNewEvent();
      await vm.saveNewEvent();
      g.resolve({ ...created });
      await first;
      assert.equal(n, 1);
      assert.deepEqual(vm.calendarEvents.map((e) => e.id), ['ev1']);
    });

    it('"Add Google Meet" sends addMeet: true only when checked; opening the modal resets it', async () => {
      const payloads = [];
      const vm = eventVm({ createCalendarEvent: async (p) => { payloads.push(p); return { ...created, id: `ev${payloads.length}` }; } });
      vm.openCreateEventModal();
      assert.equal(vm.newEventData.addMeet, false);
      vm.newEventData.title = 'Standup';
      vm.newEventData.addMeet = true;
      await vm.saveNewEvent();
      assert.equal(payloads[0].addMeet, true);
      vm.openCreateEventModal();
      assert.equal(vm.newEventData.addMeet, false);
      vm.newEventData.title = 'Lunch';
      await vm.saveNewEvent();
      assert.equal('addMeet' in payloads[1], false);
    });

    it('a created event with a meetLink is shown with that link (event modal shows Join)', async () => {
      const vm = eventVm({ createCalendarEvent: async () => ({ ...created, meetLink: 'https://meet.google.com/abc-defg-hij' }) });
      vm.newEventData.addMeet = true;
      await vm.saveNewEvent();
      const evt = vm.calendarEvents.find((e) => e.id === 'ev1');
      assert.equal(evt.meetLink, 'https://meet.google.com/abc-defg-hij');
      vm.openEventModal(evt);
      assert.equal(vm.selectedEvent.meetLink, 'https://meet.google.com/abc-defg-hij');
      assert.equal(vm.errorTray.length, 0);
    });

    it('meetError: the event is kept (it IS saved), the modal closes, and a meet:<id> tray entry carries the reason', async () => {
      const vm = eventVm({ createCalendarEvent: async () => ({ ...created, meetError: 'Meet conference could not be created (quota).' }) });
      vm.newEventData.addMeet = true;
      await captureConsoleError(async () => { await vm.saveNewEvent(); });
      assert.deepEqual(vm.calendarEvents.map((e) => e.id), ['ev1']);
      assert.deepEqual(c.cache.getCached(DATE).calendarEvents.map((e) => e.id), ['ev1']);
      assert.equal(vm.createEventModalOpen, false);
      assert.equal(vm.createEventError, null);
      const e = entry(vm, 'meet:ev1');
      assert.ok(e, 'meet warning filed');
      assert.match(e.message, /Meet conference could not be created \(quota\)\./);
      assert.match(e.message, /saved/i);
    });

    it('meetError is still filed when the user navigated away mid-create', async () => {
      const g = deferred();
      const vm = eventVm({ createCalendarEvent: () => g.promise });
      vm.newEventData.addMeet = true;
      const p = vm.saveNewEvent();
      vm.selectedDate = '2026-10-12';
      vm.calendarEvents = [];
      g.resolve({ ...created, meetError: 'Meet failed' });
      await captureConsoleError(async () => { await p; });
      assert.match(entry(vm, 'meet:ev1').message, /Meet failed/);
    });

    it('navigating away mid-create caches the event on the original day only', async () => {
      const g = deferred();
      const vm = eventVm({ createCalendarEvent: () => g.promise });
      const p = vm.saveNewEvent();
      vm.selectedDate = '2026-10-12';
      vm.calendarEvents = [];
      g.resolve({ ...created });
      await p;
      assert.equal(vm.calendarEvents.length, 0);
      assert.deepEqual(c.cache.getCached(DATE).calendarEvents.map((e) => e.id), ['ev1']);
    });
  });
}

describe('createCalendarEvent bridges', () => {
  it('src/gasBridge.js mock returns an event in the getDailyData shape and lists it for that day', async () => {
    const bridge = new GASBridge(true);
    const evt = await bridge.createCalendarEvent({
      title: 'Dentist', dateStr: '2026-11-02', startTime: '09:00', endTime: '10:30', location: 'Room 2', addMeet: true
    });
    assert.deepEqual(Object.keys(evt).sort(),
      ['description', 'endTime', 'htmlLink', 'id', 'location', 'meetLink', 'startTime', 'syncTaskId', 'title']);
    assert.equal(typeof evt.id, 'string');
    assert.equal(evt.title, 'Dentist');
    assert.match(evt.startTime, /^2026-11-02T09:00:00[+-]\d{2}:\d{2}$/);
    assert.match(evt.endTime, /^2026-11-02T10:30:00[+-]\d{2}:\d{2}$/);
    assert.equal(evt.description, '');
    assert.match(evt.meetLink, /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/, 'addMeet yields a Meet link');
    assert.equal(evt.syncTaskId, null);
    const day = await bridge.getDailyData('2026-11-02');
    assert.ok(day.calendarEvents.some((e) => e.id === evt.id));
  });

  it('src/gasBridge.js mock: no addMeet means no Meet link; mockMeetError simulates a saved event whose Meet failed', async () => {
    const bridge = new GASBridge(true);
    const plain = await bridge.createCalendarEvent({ title: 'Lunch', dateStr: '2026-11-03', startTime: '12:00', endTime: '13:00' });
    assert.equal(plain.meetLink, null);
    assert.equal('meetError' in plain, false);
    bridge.mockMeetError = 'Meet conference could not be created (simulated).';
    const evt = await bridge.createCalendarEvent({ title: 'Sync', dateStr: '2026-11-03', startTime: '09:00', endTime: '10:00', addMeet: true });
    assert.equal(evt.meetLink, null);
    assert.equal(evt.meetError, 'Meet conference could not be created (simulated).');
    const day = await bridge.getDailyData('2026-11-03');
    assert.ok(day.calendarEvents.some((e) => e.id === evt.id), 'the event itself is saved');
  });

  it('src/gasBridge.js mock rejects invalid input', async () => {
    const bridge = new GASBridge(true);
    await assert.rejects(() => bridge.createCalendarEvent({ title: '', dateStr: '2026-11-02', startTime: '09:00', endTime: '10:00' }), /^Error: Invalid event: .*title/i);
    await assert.rejects(() => bridge.createCalendarEvent({ title: 'x', dateStr: '2026-11-02', startTime: '11:00', endTime: '10:00' }), /^Error: Invalid event: .*end/i);
  });

  it('gas-app/Script.html bridge calls the createCalendarEvent RPC, and errors when google.script.run is missing', async () => {
    const { scope } = loadScriptHtml({ exportNames: ['GASBridge', 'window'] });
    const bridge = new scope.GASBridge(false);
    await assert.rejects(() => bridge.createCalendarEvent({ title: 'x' }), /unavailable/i);
    const seen = [];
    const run = {
      _ok: null,
      _fail: null,
      withSuccessHandler(fn) { this._ok = fn; return this; },
      withFailureHandler(fn) { this._fail = fn; return this; },
      createCalendarEvent(p) { seen.push(p); this._ok({ id: 'srv1', title: p.title }); }
    };
    scope.window.google = { script: { run } };
    const evt = await bridge.createCalendarEvent({ title: 'Dentist' });
    assert.deepEqual(seen, [{ title: 'Dentist' }]);
    assert.equal(evt.id, 'srv1');
  });
});
