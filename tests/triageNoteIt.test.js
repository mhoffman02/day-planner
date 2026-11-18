/**
 * @file triageNoteIt.test.js
 * @description Triage [Note it] and the Today "Email" topic (user 2026-11-17): the button files the email under
 * the 🎯/Note label and archives it; the Today Notes column lists that day's filed emails as a read-only topic
 * (never a note card, so nothing is written to the Doc) with a hover preview. Runs against BOTH client copies.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bothClients, makeVm, settle } from './helpers/plannerHarness.js';

const clients = await bothClients();
const FLAGS = { GMAIL_ROUTER: true, NOTES: true, TRIAGE_BOARD: true };
const item = { threadId: 't1', subject: 'Renewal terms' };

describe('Triage Note it and the Today Email topic', () => {
  for (const c of clients) {
    const vmFor = (bridge = {}) => {
      const vm = makeVm(c.factory, { bridge, hubFlags: FLAGS, hubDryRun: false, hubNowMs: Date.now() });
      vm.reportError = () => {};
      vm.resolveError = () => {};
      vm.scheduleTriageReload = () => {};
      return vm;
    };

    it(c.label + ': noteTriageEntry files the thread, takes the row off the board and refreshes today', async () => {
      const calls = [];
      const vm = vmFor({
        noteTriageThread: async (id, opts) => { calls.push(['note', id, opts]); return { ok: true, status: 'DONE', message: 'Filed' }; },
        getFiledEmails: async (d) => { calls.push(['filed', d]); return { ok: true, items: [{ subject: 'Renewal terms', fromName: 'Pat', gmailUrl: 'u', snippet: 's', filedOn: d }] }; }
      });
      vm.selectedDate = vm.todayStr;
      const r = await vm.noteTriageEntry(item);
      await settle();
      assert.equal(r.ok, true);
      assert.deepEqual(calls.map((x) => x[0]), ['note', 'filed']);
      assert.equal(calls[0][1], 't1');
      assert.equal(calls[1][1], vm.todayStr);
      assert.equal(vm.filedEmails.length, 1);
    });

    it(c.label + ': noteTriageEntry refreshes the open day even when it is not today, since an email files under its own day', async () => {
      const calls = [];
      const vm = vmFor({
        noteTriageThread: async () => ({ ok: true, status: 'DONE', message: 'Filed' }),
        getFiledEmails: async (d) => { calls.push(d); return { ok: true, items: [] }; }
      });
      vm.selectedDate = '2026-11-10';
      await vm.noteTriageEntry(item);
      await settle();
      assert.deepEqual(calls, ['2026-11-10']);
    });

    it(c.label + ': loadFiledEmails asks for the open day and drops a late answer for another day', async () => {
      let release;
      const gate = new Promise((res) => { release = res; });
      const asked = [];
      const vm = vmFor({
        getFiledEmails: async (d) => { asked.push(d); await gate; return { ok: true, items: [{ subject: 'Old day', fromName: '', gmailUrl: 'u', snippet: '', filedOn: d }] }; }
      });
      vm.selectedDate = '2026-11-10';
      const pending = vm.loadFiledEmails();
      vm.selectedDate = '2026-11-11';
      release();
      await pending;
      assert.deepEqual(asked, ['2026-11-10']);
      assert.deepEqual(vm.filedEmails, []);
    });

    it(c.label + ': opening a day loads that day\'s filed emails', async () => {
      const vm = vmFor({ getDailyData: async () => ({ ok: true, tasks: [], events: [], noteContent: '' }) });
      let loads = 0;
      vm.loadFiledEmails = () => { loads += 1; return Promise.resolve(); };
      vm.selectedDate = '2026-11-10';
      await vm.loadDayData().catch(() => {});
      assert.equal(loads, 1);
    });

    it(c.label + ': with NOTES off nothing is requested', async () => {
      const vm = vmFor({ getFiledEmails: async () => { throw new Error('must not be called'); } });
      vm.hubFlags = { GMAIL_ROUTER: true, NOTES: false };
      await vm.loadFiledEmails();
      assert.deepEqual(vm.filedEmails, []);
    });
  }

  for (const f of ['index.html', 'gas-app/Index.html']) {
    const html = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    it(f + ': Triage rows have a Note it button wired to noteTriageEntry', () => {
      assert.match(html, /@click="noteTriageEntry\(item\)"/);
    });
    it(f + ': the Filed emails details row is gone; the Email topic lists filedEmails with a hover preview', () => {
      assert.ok(!html.includes('hub-filed-emails'));
      assert.match(html, /class="email-topic"/);
      assert.match(html, /x-for="n in filedEmails"/);
      assert.match(html, /openNotesPopover\('email:' \+ n\.gmailUrl/);
    });
  }
});
