/**
 * @file hubLastRunRefresh.test.js
 * @description User 2026-11-06: the Triage "last run" text never moved while the tab stayed open. A background poll
 * (every 5 min while visible, and when the tab becomes visible) now refreshes only lastRun, quietly: no spinner, no
 * toast, and a failure keeps the old text. Runs against BOTH client copies.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

const clients = await bothClients();
const OLD = { at: '2026-11-06T17:47:01.669Z', status: 'DONE' };
const NEW = { at: '2026-11-06T17:52:01.000Z', status: 'DONE' };

function vmFor(c, impl) {
  const calls = [];
  const vm = makeVm(c.factory, {
    hubFlags: { GMAIL_ROUTER: true, TRIAGE_BOARD: true }, hubNowMs: Date.now(), hubLastRun: OLD,
    bridge: { getHubStatus: async () => { calls.push(1); return impl(); } }
  });
  return { vm, calls };
}

describe('Triage last-run background refresh', () => {
  for (const c of clients) {
    describe(c.label, () => {
      it('replaces lastRun from a fresh status', async () => {
        const { vm } = vmFor(c, async () => ({ ok: true, lastRun: NEW, flags: { TRIAGE_BOARD: true } }));
        await vm.refreshHubLastRun();
        assert.deepEqual(vm.hubLastRun, NEW);
      });
      it('keeps the old text and logs the stack when the call throws', async () => {
        const errors = [];
        const orig = console.error;
        console.error = (...a) => errors.push(a.join(' '));
        try {
          const { vm } = vmFor(c, async () => { throw new Error('boom'); });
          await vm.refreshHubLastRun();
          assert.deepEqual(vm.hubLastRun, OLD);
          assert.ok(errors.some((e) => e.includes('boom')));
        } finally {
          console.error = orig;
        }
      });
      it('keeps the old text on a not-ok status', async () => {
        const { vm } = vmFor(c, async () => ({ ok: false, message: 'x' }));
        await vm.refreshHubLastRun();
        assert.deepEqual(vm.hubLastRun, OLD);
      });
      it('skips when the Triage tab is not shown, and throttles calls within 60 s', async () => {
        const hidden = vmFor(c, async () => ({ ok: true, lastRun: NEW }));
        hidden.vm.hubFlags = null;
        await hidden.vm.refreshHubLastRun();
        assert.equal(hidden.calls.length, 0);
        const { vm, calls } = vmFor(c, async () => ({ ok: true, lastRun: NEW }));
        await vm.refreshHubLastRun();
        await vm.refreshHubLastRun();
        assert.equal(calls.length, 1);
      });
    });
  }
});
