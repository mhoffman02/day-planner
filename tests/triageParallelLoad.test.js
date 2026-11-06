/**
 * @file triageParallelLoad.test.js
 * @description Load speed (2026-11-06): the Doc items request goes out with the Triage board request, not after
 * it, and a board refused with FLAG_OFF (flags saved from an earlier visit are stale) is a quiet no-op.
 * Runs against BOTH client copies.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm, settle } from './helpers/plannerHarness.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const gmail = (id) => ({ threadId: id, subject: id, fromName: 'Pat', labels: [], score: 5, signals: [], suggestions: [], ledgerStatus: null, operationKey: null });
const docRow = (id) => ({ itemId: id, sourceType: 'DOC_COMMENT', subject: id, score: 6, labels: [], signals: [], suggestions: [] });
const board = () => ({ ok: true, status: 'OK', queues: { directAction: [gmail('g1')], meetingCarryIns: [], systemExceptions: [], fyiReading: [] } });
const docIds = (vm) => vm.triageQueueList.flatMap((q) => q.items).filter((i) => i.sourceType === 'DOC_COMMENT').map((i) => i.itemId);

const clients = await bothClients({});

describe('Triage board and Doc items load in parallel', () => {
  beforeEach(() => {
    globalThis.sessionStorage = fakeStorage();
    globalThis.localStorage = fakeStorage();
  });

  for (const c of clients) {
    it(c.label + ': the Doc request is sent while the board request is still pending', async () => {
      let releaseBoard;
      const boardGate = new Promise((r) => { releaseBoard = r; });
      let docCalls = 0;
      const bridge = {
        getTriageBoard: async () => { await boardGate; return board(); },
        getDocActionItems: async () => { docCalls += 1; return { ok: true, rows: [docRow('f~c1')], truncated: 0 }; }
      };
      const vm = makeVm(c.factory, { bridge, hubFlags: { GMAIL_ROUTER: true, TRIAGE_BOARD: true }, hubDryRun: true, hubNowMs: Date.now() });
      vm.reportError = () => {};
      vm.resolveError = () => {};
      const loading = vm.loadTriageBoard();
      await settle();
      assert.equal(docCalls, 1, 'Doc items must be requested before the board returns');
      releaseBoard();
      await loading;
      await settle();
      assert.equal(docCalls, 1, 'one Doc request per board load');
      assert.deepEqual(docIds(vm), ['f~c1'], 'Doc rows that arrived before the board still show once it lands');
    });

    it(c.label + ': a FLAG_OFF board is not reported as a load failure', async () => {
      const errors = [];
      const bridge = {
        getTriageBoard: async () => ({ ok: false, errorCode: 'FLAG_OFF', message: 'Triage is off' }),
        getDocActionItems: async () => ({ ok: false, errorCode: 'FLAG_OFF' })
      };
      const vm = makeVm(c.factory, { bridge, hubFlags: { GMAIL_ROUTER: true, TRIAGE_BOARD: true }, hubDryRun: true, hubNowMs: Date.now() });
      vm.reportError = (key) => errors.push(key);
      vm.resolveError = () => {};
      await vm.loadTriageBoard();
      await settle();
      assert.deepEqual(errors, []);
    });
  }
});
