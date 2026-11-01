/**
 * @file refreshAll.test.js
 * @description The header Refresh button re-fetches every view from Google (refreshAll), run
 * against BOTH client copies. Loaders are stubbed on the instance unless the test needs the real
 * one; unsaved writes (saveQueue) suppress re-applying server data for task views.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bothClients, makeVm, settle, captureConsoleError } from './helpers/plannerHarness.js';

const clients = await bothClients();
const entry = (vm, key) => (vm.errorTray || []).find((e) => e.key === key) || null;

function stubbed(c, extra = {}) {
  const calls = [];
  const rec = (name) => async (opts) => { calls.push([name, opts]); };
  const vm = makeVm(c.factory, {
    selectedDate: '2026-10-09', selectedYear: 2026, selectedMonth: 10,
    dailyTasks: [], calendarEvents: [], buildScheduleGrid: () => {},
    loadDayData: rec('day'), loadMasterTasks: rec('master'), loadMonthlyCalendarData: rec('month'),
    loadFutureMatrix: rec('future'), loadHubStatus: rec('hub'),
    loadTriageBoard: rec('triage'), loadMeetingPrep: rec('prep'),
    ...extra
  });
  return { vm, calls };
}

for (const c of clients) {
  describe(`refreshAll [${c.label}]`, () => {
    it('re-fetches day, master and monthly with strict (rethrowing) loaders', async () => {
      const { vm, calls } = stubbed(c);
      await vm.refreshAll();
      const names = calls.map((x) => x[0]);
      for (const n of ['day', 'master', 'month', 'hub']) assert.ok(names.includes(n), `${n} loader called`);
      for (const [n, opts] of calls) if (['day', 'master', 'month'].includes(n)) assert.equal(opts && opts.strict, true, `${n} strict`);
      assert.equal(vm.isSyncing, false);
    });

    it('loads Future Matrix only once it has been loaded, and hub views only when their nav shows', async () => {
      const a = stubbed(c);
      await a.vm.refreshAll();
      assert.ok(!a.calls.some((x) => ['future', 'triage', 'prep'].includes(x[0])));
      const b = stubbed(c, { futureMatrixLoaded: true, hubFlags: {} });
      Object.defineProperty(b.vm, 'showTriageNav', { get: () => true });
      Object.defineProperty(b.vm, 'showMeetingPrepNav', { get: () => true });
      await b.vm.refreshAll();
      const names = b.calls.map((x) => x[0]);
      for (const n of ['future', 'triage', 'prep']) assert.ok(names.includes(n), `${n} loaded`);
    });

    it('skips Triage while Gmail is cooling down', async () => {
      const { vm, calls } = stubbed(c, { hubNowMs: 10, gmailCooldownUntil: 99 });
      Object.defineProperty(vm, 'showTriageNav', { get: () => true });
      await vm.refreshAll();
      assert.ok(!calls.some((x) => x[0] === 'triage'));
    });

    it('a failing loader files sync:<view> with a Retry and does not stop the others', async () => {
      const { vm, calls } = stubbed(c, { loadMasterTasks: async () => { throw new Error('Tasks API 503'); } });
      const logs = await captureConsoleError(async () => { await vm.refreshAll(); });
      assert.ok(logs.some((l) => /Tasks API 503/.test(l)), 'stack logged');
      const e = entry(vm, 'sync:master');
      assert.ok(e && /Tasks API 503/.test(e.message));
      assert.equal(typeof e.retry, 'function');
      const names = calls.map((x) => x[0]);
      assert.ok(names.includes('day') && names.includes('month'), 'other loaders still ran');
      assert.equal(vm.isSyncing, false);
    });

    it('a later successful refresh resolves sync:* entries', async () => {
      const { vm } = stubbed(c);
      vm.reportError('sync:master', 'old');
      vm.reportError('sync:pending', 'old', { kind: 'stale' });
      vm.reportError('task-status:t1', 'keep me');
      await vm.refreshAll();
      assert.equal(entry(vm, 'sync:master'), null);
      assert.equal(entry(vm, 'sync:pending'), null);
      assert.ok(entry(vm, 'task-status:t1'));
    });

    it('skips day/master/monthly while writes are unsaved and files an informational sync:pending', async () => {
      const { vm, calls } = stubbed(c);
      let release;
      vm.saveQueue.submit('task-status:t1', {
        value: '✓', baseline: '•', write: () => new Promise((r) => { release = r; }),
        onSaved: async () => {}, onFailed: async () => {}
      });
      await settle();
      assert.equal(vm.saveQueue.anyUnsaved(), true);
      await vm.refreshAll();
      const names = calls.map((x) => x[0]);
      for (const n of ['day', 'master', 'month']) assert.ok(!names.includes(n), `${n} not reloaded`);
      const e = entry(vm, 'sync:pending');
      assert.ok(e && e.kind === 'stale', 'informational entry');
      release({});
      await settle();
      assert.equal(vm.saveQueue.anyUnsaved(), false);
    });

    it('real loadMasterTasks in strict mode rethrows instead of swallowing, default stays swallowing', async () => {
      const bridge = { getMasterTasks: async () => { throw new Error('boom'); } };
      const vm = makeVm(c.factory, { selectedYear: 2026, selectedMonth: 10, bridge });
      await captureConsoleError(async () => {
        await assert.rejects(() => vm.loadMasterTasks({ strict: true }), /boom/);
        await vm.loadMasterTasks();
      });
    });
  });
}

describe('header Refresh button wiring', () => {
  for (const f of ['index.html', 'gas-app/Index.html']) {
    it(`${f} calls refreshAll()`, () => {
      const html = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
      const m = html.match(/<button[^>]*sync-btn-compact[^>]*>/);
      assert.ok(m);
      assert.match(m[0], /@click="refreshAll\(\)"/);
      assert.match(m[0], /title="Refresh all views from Google Calendar &amp; Tasks"/);
    });
  }
});
