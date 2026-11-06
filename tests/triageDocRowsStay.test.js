/**
 * @file triageDocRowsStay.test.js
 * @description Live WORK 2026-11-05: Doc rows in Triage vanished for minutes. Every board reload replaced
 * triageBoard with Gmail-only queues and the Doc rows came back only when the slow Doc RPC (up to 240 s)
 * returned. Doc rows already loaded must stay on screen while a reload is in flight. Runs against BOTH client copies.
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

describe('Triage Doc rows survive a board reload', () => {
  beforeEach(() => {
    globalThis.sessionStorage = fakeStorage();
    globalThis.localStorage = fakeStorage();
  });

  for (const c of clients) {
    it(c.label + ': Doc rows stay while the slow Doc RPC is in flight', async () => {
      let release;
      const gate = new Promise((r) => { release = r; });
      const bridge = {
        getTriageBoard: async () => board(),
        getDocActionItems: async () => { await gate; return { ok: true, rows: [docRow('f~c1'), docRow('f~c2')], truncated: 0 }; }
      };
      const vm = makeVm(c.factory, { bridge, hubFlags: { GMAIL_ROUTER: true, TRIAGE_BOARD: true }, hubDryRun: true, hubNowMs: Date.now() });
      vm.reportError = () => {};
      vm.resolveError = () => {};
      vm.triageBoard = board();
      vm.docActionRows = [docRow('f~c1'), docRow('f~c2')].map((r) => ({ ...r, threadId: r.itemId }));
      vm.mergeDocRows();
      assert.deepEqual(docIds(vm), ['f~c1', 'f~c2']);
      await vm.loadTriageBoard({ refresh: true });
      await settle();
      assert.deepEqual(docIds(vm), ['f~c1', 'f~c2'], 'rows must not vanish while the Doc load is pending');
      release();
      await settle();
      assert.deepEqual(docIds(vm), ['f~c1', 'f~c2']);
    });
  }
});
