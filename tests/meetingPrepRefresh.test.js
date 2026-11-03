/**
 * @file meetingPrepRefresh.test.js
 * @description Meeting Prep Refresh runs a live mail check (the existing processWorkflowQueue RPC) before it
 * reloads saved data, so a freshly labelled email shows without waiting for the scheduled tick (user chose
 * option 2, 2026-11-02). One queue call per click, none inside 60 s of the last or during the Gmail cooldown,
 * a quota error starts the shared cooldown, every failure is reported loudly. Runs against BOTH client copies.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm, captureConsoleError } from './helpers/plannerHarness.js';

const COOLDOWN_KEY = 'dayPlannerGmailCooldownUntil';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

const hubStatus = { ok: true, flags: { GMAIL_ROUTER: true, NCMMS_CORE_PILOT: true }, dryRun: false, lastRun: null, counts: {} };
const prep = { ok: true, status: 'OK', message: 'x', carryIns: [], carryInCount: 0 };
const okResult = (status) => ({ ok: true, status, message: 'ok' });

function vmFor(c, queueResult, calls) {
  const bridge = {
    getHubStatus: async () => { calls.push('getHubStatus'); return hubStatus; },
    getMeetingPrep: async () => { calls.push('getMeetingPrep'); return prep; },
    processWorkflowQueue: async () => {
      calls.push('processWorkflowQueue');
      if (queueResult instanceof Error) throw queueResult;
      return queueResult;
    }
  };
  const vm = makeVm(c.factory, { bridge, hubNowMs: Date.now() });
  vm.errorsSeen = [];
  vm.reportError = (key, msg) => vm.errorsSeen.push({ key, msg });
  vm.resolveError = () => {};
  return vm;
}

const clients = await bothClients();

describe('Meeting Prep Refresh runs a live mail check', () => {
  beforeEach(() => {
    globalThis.sessionStorage = fakeStorage();
    globalThis.localStorage = fakeStorage();
  });

  for (const c of clients) {
    describe(c.label, () => {
      it('success: processWorkflowQueue exactly once, then hub status, then getMeetingPrep; status line says Mail checked HH:MM', async () => {
        const calls = [];
        const vm = vmFor(c, okResult('DONE'), calls);
        await vm.refreshMeetingPrep();
        assert.deepEqual(calls, ['processWorkflowQueue', 'getHubStatus', 'getMeetingPrep']);
        assert.match(vm.meetingPrepMailNote, /^Mail checked \d\d:\d\d/);
        assert.equal(vm.meetingPrepRefreshing, false, 'button re-enabled');
        assert.deepEqual(vm.errorsSeen, []);
      });

      it('button flag is on while the mail check runs', async () => {
        const calls = [];
        const vm = vmFor(c, okResult('OK'), calls);
        let seen;
        vm.bridge.processWorkflowQueue = async () => { seen = vm.meetingPrepRefreshing; return okResult('OK'); };
        await vm.refreshMeetingPrep();
        assert.equal(seen, true);
      });

      it('skips the live check inside 60 s of the last one, still reloads, and says when the next check is allowed', async () => {
        const calls = [];
        const vm = vmFor(c, okResult('OK'), calls);
        vm.meetingMailCheckedAt = Date.now() - 20000;
        await vm.refreshMeetingPrep();
        assert.deepEqual(calls, ['getHubStatus', 'getMeetingPrep']);
        assert.match(vm.meetingPrepMailNote, /^Mail was checked \d\d:\d\d; next check allowed in (39|40) s$/);
      });

      it('checks again once 60 s have passed', async () => {
        const calls = [];
        const vm = vmFor(c, okResult('OK'), calls);
        vm.meetingMailCheckedAt = Date.now() - 61000;
        await vm.refreshMeetingPrep();
        assert.equal(calls.filter((x) => x === 'processWorkflowQueue').length, 1);
      });

      it('skips the live check during the Gmail cooldown', async () => {
        const calls = [];
        const vm = vmFor(c, okResult('OK'), calls);
        vm.meetingMailCheckedAt = Date.now() - 600000;
        globalThis.localStorage.setItem(COOLDOWN_KEY, String(Date.now() + 50000));
        await vm.refreshMeetingPrep();
        assert.deepEqual(calls, ['getHubStatus', 'getMeetingPrep']);
        assert.match(vm.meetingPrepMailNote, /^Mail was checked \d\d:\d\d; next check allowed in (49|50) s$/);
      });

      it('a quota error starts the shared cooldown, shows the message, and stops (no reload)', async () => {
        const calls = [];
        const vm = vmFor(c, { ok: false, status: 'ERROR', errorCode: 'RATE_LIMITED', message: 'Gmail is limiting requests right now. Try again in a minute.' }, calls);
        const logs = await captureConsoleError(() => vm.refreshMeetingPrep());
        assert.deepEqual(calls, ['processWorkflowQueue']);
        assert.ok(Number(globalThis.localStorage.getItem(COOLDOWN_KEY)) > Date.now(), 'cooldown started');
        assert.equal(vm.errorsSeen.length, 1);
        assert.match(vm.errorsSeen[0].msg, /limiting requests/);
        assert.ok(logs.length >= 1, 'console.error logged');
        assert.equal(vm.meetingPrepRefreshing, false);
      });

      it('a thrown quota error (Apps Script "too many times") also starts the cooldown', async () => {
        const calls = [];
        const vm = vmFor(c, new Error('Service invoked too many times for one day: gmail.'), calls);
        await captureConsoleError(() => vm.refreshMeetingPrep());
        assert.deepEqual(calls, ['processWorkflowQueue']);
        assert.ok(Number(globalThis.localStorage.getItem(COOLDOWN_KEY)) > Date.now());
        assert.equal(vm.errorsSeen.length, 1);
      });

      it('LOCK_BUSY: says another run is in progress, shows saved data, no error', async () => {
        const calls = [];
        const vm = vmFor(c, okResult('LOCK_BUSY'), calls);
        await vm.refreshMeetingPrep();
        assert.deepEqual(calls, ['processWorkflowQueue', 'getHubStatus', 'getMeetingPrep']);
        assert.match(vm.meetingPrepMailNote, /Another run is in progress; showing saved data/);
        assert.deepEqual(vm.errorsSeen, []);
      });

      it('DRY_RUN: says nothing is written and carry-ins appear after going live', async () => {
        const calls = [];
        const vm = vmFor(c, okResult('DRY_RUN'), calls);
        await vm.refreshMeetingPrep();
        assert.match(vm.meetingPrepMailNote, /^Mail checked \d\d:\d\d\. Trial mode: nothing is written; carry-ins appear after you go live$/);
        assert.deepEqual(vm.errorsSeen, []);
      });

      it('NOOP is reported, not an error', async () => {
        const calls = [];
        const vm = vmFor(c, okResult('NOOP'), calls);
        await vm.refreshMeetingPrep();
        assert.match(vm.meetingPrepMailNote, /^Mail checked \d\d:\d\d\. Nothing to process/);
        assert.deepEqual(vm.errorsSeen, []);
      });

      it('ERROR result: reported with the sanitized message and console.error, saved data still reloads', async () => {
        const calls = [];
        const vm = vmFor(c, { ok: false, status: 'ERROR', errorCode: 'ERROR', message: 'Ledger unavailable' }, calls);
        const logs = await captureConsoleError(() => vm.refreshMeetingPrep());
        assert.equal(vm.errorsSeen.length, 1);
        assert.match(vm.errorsSeen[0].msg, /Ledger unavailable/);
        assert.ok(logs.some((l) => /Ledger unavailable/.test(l)));
        assert.deepEqual(calls, ['processWorkflowQueue', 'getHubStatus', 'getMeetingPrep']);
        assert.equal(Number(globalThis.localStorage.getItem(COOLDOWN_KEY)) || 0, 0, 'no cooldown for a non-quota error');
      });

      it('thrown error: err.message to the user, err.stack to the console, never swallowed', async () => {
        const calls = [];
        const vm = vmFor(c, new Error('Network down'), calls);
        const logs = await captureConsoleError(() => vm.refreshMeetingPrep());
        assert.equal(vm.errorsSeen.length, 1);
        assert.match(vm.errorsSeen[0].msg, /Network down/);
        assert.doesNotMatch(vm.errorsSeen[0].msg, /\n\s+at /, 'no stack in UI text');
        assert.ok(logs.some((l) => l.includes('Network down') && /\n\s+at /.test(l)), 'stack logged');
        assert.equal(vm.meetingPrepRefreshing, false);
      });

      it('a null result (RPC missing) is an error, not success', async () => {
        const calls = [];
        const vm = vmFor(c, null, calls);
        await captureConsoleError(() => vm.refreshMeetingPrep());
        assert.equal(vm.errorsSeen.length, 1);
      });
    });
  }
});
