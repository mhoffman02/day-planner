/**
 * @file triageTaskDone.test.js
 * @description User 2026-11-06: Task Today / Task Later felt slow and could be clicked twice. The button now shows a
 * spinner at the click, locks as "Tasked today" / "Tasked later" on success, and the toast is for failures only.
 * Runs against BOTH client copies.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function newItem() {
  return { threadId: 't1', subject: 'Vendor call', fromName: 'Pat', labels: [], score: 9, signals: [], suggestions: [], ledgerStatus: null, operationKey: null };
}

function vmFor(c, item, impl) {
  const toasts = [];
  const calls = [];
  const vm = makeVm(c.factory, {
    hubFlags: { GMAIL_ROUTER: true, TRIAGE_BOARD: true }, hubNowMs: Date.now(),
    bridge: { routeThreadToTask: async (...args) => { calls.push(args); return impl(); } }
  });
  vm.reportError = () => {};
  vm.resolveError = () => {};
  vm.scheduleTriageReload = () => {};
  vm.showTaskToast = (msg) => { toasts.push(msg); };
  vm.triageBoard = { ok: true, queues: { directAction: [item], meetingCarryIns: [], systemExceptions: [], fyiReading: [] } };
  return { vm, toasts, calls };
}

const ok = (key) => async () => ({ ok: true, status: 'DONE', operationKey: key, message: 'Task created' });
const clients = await bothClients();

describe('Task Today / Task Later done state', () => {
  beforeEach(() => {
    globalThis.sessionStorage = fakeStorage();
    globalThis.localStorage = fakeStorage();
  });
  for (const c of clients) {
    describe(c.label, () => {
      it('shows busy while the call runs, then done, with no success toast', async () => {
        const item = newItem();
        let release;
        const gate = new Promise((r) => { release = r; });
        const { vm, toasts } = vmFor(c, item, async () => { await gate; return { ok: true, status: 'DONE', operationKey: 'GMAIL|t1|TASK_TODAY', message: 'Task created' }; });
        const pending = vm.triageTask(item, true);
        assert.equal(vm.triageTaskBusy(item), 'today');
        release();
        await pending;
        assert.equal(vm.triageTaskBusy(item), '');
        assert.equal(vm.triageTaskDone(item), 'today');
        assert.deepEqual(toasts, []);
      });
      it('a second click on a done or busy item makes no call', async () => {
        const item = newItem();
        const { vm, calls } = vmFor(c, item, ok('GMAIL|t1|TASK'));
        await vm.triageTask(item, false);
        await vm.triageTask(item, false);
        await vm.triageTask(item, true);
        assert.equal(calls.length, 1);
        assert.equal(vm.triageTaskDone(item), 'later');
      });
      it('a failed result toasts, clears busy and leaves the buttons usable', async () => {
        const item = newItem();
        const { vm, toasts } = vmFor(c, item, async () => ({ ok: false, message: 'Gmail refused' }));
        await vm.triageTask(item, true);
        assert.deepEqual(toasts, ['Task Today: Gmail refused']);
        assert.equal(vm.triageTaskBusy(item), '');
        assert.equal(vm.triageTaskDone(item), '');
      });
      it('a thrown call toasts and clears busy', async () => {
        const item = newItem();
        const { vm, toasts } = vmFor(c, item, async () => { throw new Error('boom'); });
        await vm.triageTask(item, false);
        assert.deepEqual(toasts, ['Task Later failed: boom']);
        assert.equal(vm.triageTaskBusy(item), '');
        assert.equal(vm.triageTaskDone(item), '');
      });
      it('done state survives a board reload via the ledger', () => {
        const { vm } = vmFor(c, newItem(), ok(''));
        assert.equal(vm.triageTaskDone({ ledgerStatus: 'DONE', operationKey: 'GMAIL|t1|TASK_TODAY' }), 'today');
        assert.equal(vm.triageTaskDone({ ledgerStatus: 'DONE', operationKey: 'GMAIL|t1|TASK' }), 'later');
        assert.equal(vm.triageTaskDone({ ledgerStatus: 'ERROR', operationKey: 'GMAIL|t1|TASK' }), '');
      });
    });
  }
});
