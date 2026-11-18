/**
 * @file triageRsvp.test.js
 * @description Triage [RSVP] (user 2026-11-17): invite rows (item.isInvite) show Accept, Maybe and Decline; each calls
 * the rsvpTriageThread RPC with the matching answer, and a failure puts the row back. Runs against BOTH client copies.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bothClients, makeVm, settle } from './helpers/plannerHarness.js';

const clients = await bothClients();
const FLAGS = { GMAIL_ROUTER: true, NOTES: true, TRIAGE_BOARD: true };
const item = { threadId: 't1', subject: 'Invitation: Planning', isInvite: true };

describe('Triage RSVP', () => {
  for (const c of clients) {
    const vmFor = (bridge = {}) => {
      const vm = makeVm(c.factory, { bridge, hubFlags: FLAGS, hubDryRun: false, hubNowMs: Date.now() });
      vm.reportError = () => {};
      vm.resolveError = () => {};
      vm.scheduleTriageReload = () => {};
      return vm;
    };

    for (const answer of ['accepted', 'tentative', 'declined']) {
      it(`${c.label}: rsvpTriageEntry sends ${answer} with the thread id and mode`, async () => {
        const calls = [];
        const vm = vmFor({ rsvpTriageThread: async (id, response, opts) => { calls.push([id, response, opts]); return { ok: true, status: 'DONE', message: 'Answered' }; } });
        const r = await vm.rsvpTriageEntry(item, answer);
        await settle();
        assert.equal(r.ok, true);
        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].slice(0, 2), ['t1', answer]);
      });
    }

    it(`${c.label}: a failed answer is shown and not swallowed`, async () => {
      const vm = vmFor({ rsvpTriageThread: async () => ({ ok: false, status: 'ERROR', errorCode: 'EVENT_NOT_FOUND', message: 'This invite is not on your calendar yet' }) });
      const r = await vm.rsvpTriageEntry(item, 'accepted');
      await settle();
      assert.equal(r.ok, false);
      assert.equal(vm.triageNotice.kind, 'error');
      assert.match(vm.triageNotice.text, /not on your calendar/);
    });
  }

  for (const f of ['index.html', 'gas-app/Index.html']) {
    it(`${f}: the three answers show only on invite rows and keep the stale lock`, () => {
      const html = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
      const start = html.indexOf('<template x-if="item.isInvite === true">');
      assert.ok(start > 0, 'invite template present');
      const block = html.slice(start, html.indexOf('</template>', start));
      const buttons = block.match(/<button [^>]*>/g) || [];
      assert.equal(buttons.length, 3);
      for (const b of buttons) assert.match(b, /:disabled="triageStale"/);
      for (const a of ['accepted', 'tentative', 'declined']) assert.ok(block.includes(`rsvpTriageEntry(item, '${a}')`), a);
    });
  }
});
