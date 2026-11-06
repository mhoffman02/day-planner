/**
 * @file triageToast.test.js
 * @description User 2026-11-04: Triage actions were silent (the only acknowledgement was a banner at the top of the
 * board, off-screen on a long queue) so the user double- and triple-tapped. Every action result now also raises the
 * floating toast. Runs against BOTH client copies.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

const item = { threadId: 't1', subject: 'Vendor call', fromName: 'Pat', labels: [], score: 9, signals: [], suggestions: [], ledgerStatus: null, operationKey: null };

function vmFor(c, result, reject = false) {
  const toasts = [];
  const vm = makeVm(c.factory, {
    hubFlags: { GMAIL_ROUTER: true, TRIAGE_BOARD: true }, hubNowMs: Date.now(),
    bridge: {
      routeThreadToTask: async () => { if (reject) throw new Error('boom'); return result; },
      archiveTriageThread: async () => result
    }
  });
  vm.reportError = () => {};
  vm.resolveError = () => {};
  vm.scheduleTriageReload = () => {};
  vm.showTaskToast = (msg, undo = null) => { toasts.push({ msg, undo }); };
  vm.triageBoard = { ok: true, queues: { directAction: [item], meetingCarryIns: [], systemExceptions: [], fyiReading: [] } };
  return { vm, toasts };
}

const clients = await bothClients();

describe('Triage action toast', () => {
  beforeEach(() => {
    globalThis.sessionStorage = fakeStorage();
    globalThis.localStorage = fakeStorage();
  });
  for (const c of clients) {
    describe(c.label, () => {
      it('a successful Task Today stays quiet: the button shows the result (see triageTaskDone.test.js)', async () => {
        const { vm, toasts } = vmFor(c, { ok: true, status: 'DONE', operationKey: 'GMAIL|t1|TASK_TODAY', message: 'Task created' });
        const own = { ...item };
        vm.triageBoard = { ok: true, queues: { directAction: [own], meetingCarryIns: [], systemExceptions: [], fyiReading: [] } };
        await vm.triageTask(own, true);
        assert.deepEqual(toasts, []);
      });
      it('a failed result toasts the failure', async () => {
        const { vm, toasts } = vmFor(c, { ok: false, message: 'Gmail refused' });
        await vm.archiveTriageEntry(item);
        assert.deepEqual(toasts.map((t) => t.msg), ['Archive: Gmail refused']);
      });
      it('a thrown call toasts the failure', async () => {
        const { vm, toasts } = vmFor(c, null, true);
        await vm.triageTask(item, false);
        assert.deepEqual(toasts.map((t) => t.msg), ['Task Later failed: boom']);
      });
      it('Read Later toasts', () => {
        const { vm, toasts } = vmFor(c, null);
        vm.readLaterItem(item);
        assert.equal(toasts.length, 1);
        assert.match(toasts[0].msg, /^Read Later/);
      });
    });
  }
});
