/**
 * @file docFreshness.test.js
 * @description User 2026-11-06 (WORK): opening Triage reloaded the Doc items (1-2 minutes) although the startup prefetch
 * had just loaded them. A board load skips the Doc request when Docs loaded under 5 minutes ago in this session; Refresh
 * (refresh) and a finished action or Sync (after) still force it. Runs against BOTH client copies.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm, settle } from './helpers/plannerHarness.js';

const clients = await bothClients();
const MIN = 60000;

function vmWith(c, docLoadedAt) {
  const calls = { docs: 0, board: 0 };
  const vm = makeVm(c.factory, {
    docLoadedAt,
    bridge: {
      getTriageBoard: async () => { calls.board++; return { ok: true, queues: {} }; },
      getDocActionItems: async () => { calls.docs++; return { ok: true, rows: [], truncated: 0 }; }
    }
  });
  return { vm, calls };
}

for (const c of clients) {
  describe(`doc freshness [${c.label}]`, () => {
    it('skips the Doc request when Docs loaded 1 minute ago', async () => {
      const { vm, calls } = vmWith(c, Date.now() - MIN);
      await vm.loadTriageBoard();
      await settle();
      assert.equal(calls.board, 1);
      assert.equal(calls.docs, 0);
    });

    it('loads Docs when they are 6 minutes old', async () => {
      const { vm, calls } = vmWith(c, Date.now() - 6 * MIN);
      await vm.loadTriageBoard();
      await settle();
      assert.equal(calls.docs, 1);
    });

    it('loads Docs on first use and records when they loaded', async () => {
      const { vm, calls } = vmWith(c, 0);
      await vm.loadTriageBoard();
      await settle();
      assert.equal(calls.docs, 1);
      assert.ok(Date.now() - vm.docLoadedAt < 5000);
    });

    it('Refresh and a finished action or Sync still force the Doc request', async () => {
      for (const opts of [{ refresh: true }, { after: true }]) {
        const { vm, calls } = vmWith(c, Date.now() - MIN);
        await vm.loadTriageBoard(opts);
        await settle();
        assert.equal(calls.docs, 1, JSON.stringify(opts));
      }
    });

    it('a failed Doc load does not count as fresh', async () => {
      const vm = makeVm(c.factory, { docLoadedAt: 0, bridge: { getDocActionItems: async () => { throw new Error('boom'); } } });
      const realError = console.error;
      console.error = () => {};
      try { await vm.loadDocActionItems(); } finally { console.error = realError; }
      assert.equal(vm.docLoadedAt, 0);
    });
  });
}
