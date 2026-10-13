/**
 * @file triageDailyRefresh.test.js
 * @description User 2026-10-13: Triage "Task Today" created the Google Task, but the Daily tab kept showing the task
 * list it had before (setView('daily') never re-fetched), so the new task looked missing. After a Triage action
 * that created a Task, going back to Daily re-fetches the day; otherwise switching tabs stays fetch-free.
 * Runs against BOTH client copies.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm, settle } from './helpers/plannerHarness.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

const DATE = '2026-10-13';
const item = { threadId: 't1', subject: 'Vendor call', fromName: 'Pat', labels: [], score: 9, signals: [], suggestions: [], ledgerStatus: null, operationKey: null };
const board = { ok: true, status: 'OK', queues: { directAction: [item], meetingCarryIns: [], systemExceptions: [], fyiReading: [] } };

function vmFor(c, routeResult) {
  const calls = { daily: 0 };
  const vm = makeVm(c.factory, {
    selectedDate: DATE, selectedYear: 2026, selectedMonth: 10, dailyTasks: [], masterTasks: [], calendarEvents: [], dailyNote: '',
    hubFlags: { GMAIL_ROUTER: true, TRIAGE_BOARD: true }, hubDryRun: routeResult.status === 'DRY_RUN', hubNowMs: Date.now(),
    bridge: {
      getDailyData: async () => { calls.daily += 1; return { tasks: [{ id: 'k1', title: 'A1 Vendor call', status: 'Not Started', dueDate: DATE }], calendarEvents: [], noteContent: null, docUrl: '' }; },
      routeThreadToTask: async () => routeResult,
      getTriageBoard: async () => board
    }
  });
  vm.reportError = () => {};
  vm.resolveError = () => {};
  vm.triageBoard = JSON.parse(JSON.stringify(board));
  vm.triageSavedAt = Date.now();
  return { vm, calls };
}

const clients = await bothClients();

describe('Daily re-fetches after a Triage Task', () => {
  beforeEach(() => {
    globalThis.sessionStorage = fakeStorage();
    globalThis.localStorage = fakeStorage();
  });

  for (const c of clients) {
    describe(c.label, () => {
      it('Task Today, then Daily: the day is fetched again and shows the new task', async () => {
        const { vm, calls } = vmFor(c, { ok: true, status: 'DONE', operationKey: 'GMAIL|t1|TASK_TODAY', message: 'Task created' });
        await vm.setView('triage');
        await vm.triageTask(vm.triageBoard.queues.directAction[0], true);
        await vm.setView('daily');
        await settle();
        assert.equal(calls.daily, 1);
        assert.deepEqual(vm.dailyTasks.map((t) => t.id), ['k1']);
        await vm.setView('daily');
        await settle();
        assert.equal(calls.daily, 1, 'a plain tab switch afterwards does not fetch again');
      });

      it('Task already added (SKIPPED) also refreshes Daily, so a task made by the background job shows', async () => {
        const { vm, calls } = vmFor(c, { ok: true, status: 'SKIPPED', operationKey: 'GMAIL|t1|TASK_TODAY', message: 'Already processed' });
        await vm.triageTask(vm.triageBoard.queues.directAction[0], true);
        await vm.setView('daily');
        await settle();
        assert.equal(calls.daily, 1);
      });

      it('a trial-mode Task Today creates nothing, so Daily is not fetched', async () => {
        const { vm, calls } = vmFor(c, { ok: true, status: 'DRY_RUN', operationKey: 'GMAIL|t1|TASK_TODAY', message: 'Would create Task' });
        await vm.triageTask(vm.triageBoard.queues.directAction[0], true);
        await vm.setView('daily');
        await settle();
        assert.equal(calls.daily, 0);
      });

      it('the row label uses the result operation key', async () => {
        const { vm } = vmFor(c, { ok: true, status: 'DONE', operationKey: 'GMAIL|t1|TASK_TODAY', message: 'Task created' });
        await vm.triageTask(vm.triageBoard.queues.directAction[0], true);
        const row = vm.triageBoard.queues.directAction[0];
        assert.equal(vm.hubLedgerLabel(row.ledgerStatus, row.operationKey), 'Task added for today');
      });
    });
  }
});
