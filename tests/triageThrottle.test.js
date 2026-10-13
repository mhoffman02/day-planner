/**
 * @file triageThrottle.test.js
 * @description Live WORK 2026-10-12: Gmail "Units per minute per user" quota exceeded. The client stops
 * hammering Gmail: a row action updates that row from its own result and schedules ONE board reload after the
 * last action (debounced) instead of a full rebuild per click; RATE_LIMITED starts a cooldown shared by all tabs
 * (localStorage timestamp only) during which no board load is sent; the startup prefetch is skipped when the
 * saved board is recent. Runs against BOTH client copies.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bothClients, makeVm, settle, captureConsoleError } from './helpers/plannerHarness.js';

const COOLDOWN_KEY = 'dayPlannerGmailCooldownUntil';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// Manual timers: callbacks run only when flush() is called, so debounce is observable.
const pendingTimers = new Map();
let timerSeq = 0;
const timers = {
  setTimeout: (fn) => { timerSeq += 1; pendingTimers.set(timerSeq, fn); return timerSeq; },
  clearTimeout: (h) => { pendingTimers.delete(h); }
};
async function flush() {
  const fns = [...pendingTimers.values()];
  pendingTimers.clear();
  fns.forEach((fn) => fn());
  await settle();
}

const item = (id) => ({ threadId: id, subject: id, fromName: 'Pat', labels: [], score: 5, signals: [], suggestions: [], ledgerStatus: null, operationKey: null });
const board = (ids = ['a', 'b', 'c']) => ({ ok: true, status: 'OK', queues: { directAction: ids.map(item), meetingCarryIns: [], systemExceptions: [], fyiReading: [] } });
const rowIds = (vm) => vm.triageQueueList.flatMap((q) => q.items.map((i) => i.threadId));

function vmFor(c, bridge) {
  const vm = makeVm(c.factory, { bridge, hubFlags: { GMAIL_ROUTER: true, TRIAGE_BOARD: true }, hubDryRun: true, hubNowMs: Date.now() });
  vm.errorsSeen = [];
  vm.reportError = (key, msg) => vm.errorsSeen.push({ key, msg });
  vm.resolveError = () => {};
  return vm;
}

const clients = await bothClients({ timers });

describe('Triage throttling (Gmail quota)', () => {
  beforeEach(() => {
    globalThis.sessionStorage = fakeStorage();
    globalThis.localStorage = fakeStorage();
    pendingTimers.clear();
  });

  for (const c of clients) {
    describe(c.label, () => {
      it('five actions in a row: no reload per click, one board reload after the last', async () => {
        let loads = 0;
        const ok = (status) => async () => ({ ok: true, status, message: 'done' });
        const vm = vmFor(c, { getTriageBoard: async () => { loads += 1; return board(); }, routeThreadToTask: ok('DRY_RUN'), archiveTriageThread: ok('DRY_RUN'), dismissTriageItem: ok('DONE'), trashTriageThread: ok('DRY_RUN') });
        vm.triageBoard = board();
        vm.triageSavedAt = Date.now();
        const [a, b, cc] = vm.triageQueueList[0].items;
        await vm.triageTask(a, true);
        await vm.archiveTriageEntry(b);
        await vm.dismissTriageEntry(cc);
        await vm.triageTask(b, false);
        await vm.trashTriageEntry(a);
        assert.equal(loads, 0, 'no board rebuild per click');
        assert.deepEqual(rowIds(vm), ['b'], 'Dismiss and Delete remove their rows at once');
        assert.equal(vm.triageQueueList[0].items[0].ledgerStatus, 'DRY_RUN', 'the acted row shows its new ledger status');
        await flush();
        assert.equal(loads, 1, 'one debounced reload after the last action');
      });

      it('an action finishing during an in-flight load still gets a reload after it', async () => {
        let loads = 0;
        const releases = [];
        const vm = vmFor(c, {
          getTriageBoard: () => { loads += 1; return new Promise((r) => releases.push(() => r(board()))); },
          dismissTriageItem: async () => ({ ok: true, status: 'DONE', message: 'done' })
        });
        vm.triageBoard = board();
        vm.triageSavedAt = Date.now();
        const inflight = vm.loadTriageBoard();
        await vm.dismissTriageEntry(vm.triageQueueList[0].items[0]);
        await flush();
        assert.equal(loads, 1, 'the in-flight request is not duplicated');
        releases[0]();
        await inflight;
        await settle();
        assert.equal(loads, 2, 'a follow-up load runs after the in-flight one');
        releases[1]();
        await settle();
      });

      it('RATE_LIMITED: keeps the saved rows, starts a cooldown, shows a plain message, sends nothing while cooling', async () => {
        let loads = 0;
        const vm = vmFor(c, { getTriageBoard: async () => { loads += 1; return { ok: false, errorCode: 'RATE_LIMITED', retryable: true, message: 'Gmail is limiting requests right now. Try again in a minute.', queues: {} }; } });
        vm.triageBoard = board();
        vm.triageSavedAt = Date.now() - 600000;
        vm.triageStale = true;
        await captureConsoleError(() => vm.loadTriageBoard());
        assert.deepEqual(rowIds(vm), ['a', 'b', 'c']);
        assert.ok(Number(localStorage.getItem(COOLDOWN_KEY)) > Date.now() + 30000, 'cooldown shared through localStorage');
        assert.match(vm.errorsSeen[0].msg, /Gmail is limiting requests/);
        assert.ok(!/Quota exceeded/.test(vm.errorsSeen[0].msg));
        assert.equal(vm.gmailCoolingDown, true);
        await vm.loadTriageBoard();
        assert.equal(loads, 1, 'no board request while cooling down');
      });

      it('a cooldown set by another tab blocks this tab too', async () => {
        let loads = 0;
        localStorage.setItem(COOLDOWN_KEY, String(Date.now() + 60000));
        const vm = vmFor(c, { getTriageBoard: async () => { loads += 1; return board(); } });
        await vm.loadTriageBoard();
        assert.equal(loads, 0);
      });

      it('prefetch is skipped when the saved board is under 5 minutes old', async () => {
        let loads = 0;
        const vm = vmFor(c, { getTriageBoard: async () => { loads += 1; return board(); } });
        vm.triageBoard = board();
        vm.triageSavedAt = Date.now() - 60000;
        vm.triageStale = true;
        await vm.prefetchTriage();
        assert.equal(loads, 0);
        vm.triageSavedAt = Date.now() - 6 * 60000;
        await vm.prefetchTriage();
        assert.equal(loads, 1);
      });
    });
  }
});

for (const f of ['index.html', 'gas-app/Index.html']) {
  it(`${f}: Refresh is disabled while Gmail is cooling down`, () => {
    const html = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.match(html, /@click="refreshTriage\(\)" :disabled="triageLoading \|\| gmailCoolingDown"/);
  });
}
