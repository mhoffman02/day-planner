/**
 * @file hubCacheWiring.test.js
 * @description A new tab paints the last Triage board, Doc rows and Meeting Prep from IndexedDB (marked stale),
 * the server answer replaces them, and what the server returns is saved for the next tab. Runs against BOTH
 * client copies, each with its own hubCache implementation reading one scripted fake indexedDB.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { bothClients, makeVm, settle } from './helpers/plannerHarness.js';
import { packHubCacheRecord } from '../src/hubCache.js';

const rows = new Map();
const fakeDb = {
  onversionchange: null,
  objectStoreNames: { contains: () => false },
  createObjectStore() {},
  close() {},
  transaction() {
    const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
    tx.objectStore = () => ({
      put(entry) { rows.set(entry.key, entry); setImmediate(() => tx.oncomplete()); return {}; },
      delete(key) { rows.delete(key); setImmediate(() => tx.oncomplete()); return {}; },
      get(key) {
        const req = { result: undefined, error: null, onsuccess: null, onerror: null };
        setImmediate(() => { req.result = rows.get(key); req.onsuccess(); });
        return req;
      }
    });
    return tx;
  }
};
const fakeIndexedDB = {
  open() {
    const req = { result: fakeDb, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
    setImmediate(() => { req.onupgradeneeded(); req.onsuccess(); });
    return req;
  }
};
globalThis.indexedDB = fakeIndexedDB;

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const gmail = (id) => ({ threadId: id, subject: id, fromName: 'Pat', labels: [], score: 5, signals: [], suggestions: [], ledgerStatus: null, operationKey: null });
const docRow = (id) => ({ itemId: id, threadId: id, sourceType: 'DOC_COMMENT', subject: id, score: 6, labels: [], signals: [], suggestions: [] });
const seed = (key, payload) => rows.set(key, { key, ...packHubCacheRecord(payload, Date.now() - 60000) });
const allItems = (vm) => vm.triageQueueList.flatMap((q) => q.items).map((i) => i.itemId || i.threadId);

// Real timers: the immediate-timer stub would fire the IndexedDB open timeout before the fake answers.
const clients = await bothClients({ indexedDB: fakeIndexedDB, timers: { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout } });
const FLAGS = { GMAIL_ROUTER: true, TRIAGE_BOARD: true, MEETING_PREP: true };

describe('hub cache wiring', () => {
  beforeEach(() => {
    rows.clear();
    globalThis.sessionStorage = fakeStorage();
    globalThis.localStorage = fakeStorage();
  });

  for (const c of clients) {
    const vmFor = (bridge = {}) => {
      const vm = makeVm(c.factory, { bridge, hubFlags: FLAGS, hubDryRun: true, hubNowMs: Date.now() });
      vm.reportError = () => {};
      vm.resolveError = () => {};
      return vm;
    };

    it(c.label + ': a new tab shows the saved board, Doc rows and Meeting Prep marked stale', async () => {
      seed('triageBoard', { savedAt: Date.now() - 60000, queues: { directAction: [gmail('g1')], meetingCarryIns: [], systemExceptions: [], fyiReading: [] } });
      seed('docRows', { rows: [docRow('f~c1')], truncated: 0 });
      seed('meetingPrep', { series: 'NCMMS_CORE', prep: { ok: true, carryInsText: 'saved carry-ins' } });
      const vm = vmFor();
      await vm.hydrateHubFromIdb();
      assert.deepEqual(allItems(vm).sort(), ['f~c1', 'g1']);
      assert.equal(vm.triageStale, true);
      assert.equal(vm.meetingPrep.carryInsText, 'saved carry-ins');
    });

    it(c.label + ': an empty cache changes nothing', async () => {
      const vm = vmFor();
      await vm.hydrateHubFromIdb();
      assert.equal(vm.triageSavedAt, 0);
      assert.equal(vm.meetingPrep, null);
    });

    it(c.label + ': a saved Doc row dismissed this session is not shown', async () => {
      seed('docRows', { rows: [docRow('f~c1'), docRow('f~c2')], truncated: 0 });
      const vm = vmFor();
      vm.docDismissedIds = { 'f~c1': true };
      await vm.hydrateHubFromIdb();
      assert.deepEqual(vm.docActionRows.map((r) => r.itemId), ['f~c2']);
    });

    it(c.label + ': the board and Doc rows the server returns are saved for the next tab', async () => {
      const bridge = {
        getTriageBoard: async () => ({ ok: true, status: 'OK', queues: { directAction: [gmail('g2')], meetingCarryIns: [], systemExceptions: [], fyiReading: [] } }),
        getDocActionItems: async () => ({ ok: true, rows: [{ ...docRow('f~c9'), threadId: undefined }], truncated: 0 })
      };
      const vm = vmFor(bridge);
      await vm.loadTriageBoard();
      await settle();
      assert.deepEqual(rows.get('triageBoard').payload.queues.directAction.map((i) => i.threadId), ['g2']);
      assert.deepEqual(rows.get('docRows').payload.rows.map((r) => r.itemId), ['f~c9']);
    });

    it(c.label + ': Meeting Prep from the server is saved with its series', async () => {
      const vm = vmFor({ getMeetingPrep: async () => ({ ok: true, carryInsText: 'fresh' }) });
      await vm.loadMeetingPrep();
      await settle();
      assert.equal(rows.get('meetingPrep').payload.series, 'NCMMS_CORE');
      assert.equal(rows.get('meetingPrep').payload.prep.carryInsText, 'fresh');
    });

    it(c.label + ': a board restored from storage is refreshed at startup however recent it was saved', () => {
      const vm = vmFor();
      vm.triageBoard = { ok: true, queues: {} };
      vm.triageSavedAt = Date.now() - 1000;
      vm.triageStale = true;
      let loads = 0;
      vm.loadTriageBoard = () => { loads += 1; return Promise.resolve(); };
      vm.prefetchTriage();
      assert.equal(loads, 1);
    });

    it(c.label + ': clearing the Triage cache also removes the saved copies', async () => {
      seed('triageBoard', { savedAt: Date.now(), queues: {} });
      seed('docRows', { rows: [], truncated: 0 });
      const vm = vmFor();
      vm.clearTriageCache();
      await settle();
      assert.equal(rows.has('triageBoard'), false);
      assert.equal(rows.has('docRows'), false);
    });

    it(c.label + ': Clear saved data removes all three saved copies and the on-screen Meeting Prep', async () => {
      seed('triageBoard', { savedAt: Date.now(), queues: {} });
      seed('docRows', { rows: [], truncated: 0 });
      seed('meetingPrep', { series: 'NCMMS_CORE', prep: { ok: true } });
      const vm = vmFor();
      vm.meetingPrep = { ok: true, carryInsText: 'x' };
      await vm.clearSavedData();
      assert.equal(rows.size, 0);
      assert.equal(vm.meetingPrep, null);
      assert.match(vm.savedDataNote, /cleared/i);
    });
  }
});
