/**
 * @file gasBridgeRpc.test.js
 * @description Every GASBridge method must forward to the same-named google.script.run server
 * function with its arguments, resolve with the success payload and reject with the failure
 * error, when not in mock mode.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GASBridge } from '../src/gasBridge.js';

// [bridge method, args passed in, remote fn name, args the remote fn must receive]
const CASES = [
  ['getDailyData', ['2026-08-15'], 'getDailyData', ['2026-08-15']],
  ['getDayDocLink', ['2026-08-15'], 'getDayDocLink', ['2026-08-15']],
  ['getDailyDataRange', ['2026-08-01', '2026-08-31'], 'getDailyDataRange', ['2026-08-01', '2026-08-31']],
  ['getMasterTasks', ['2026-08'], 'getMasterTasks', ['2026-08']],
  ['addDailyTask', ['2026-08-15', 'T', 'Work', 'm1', 'n'], 'addDailyTask', ['2026-08-15', 'T', 'Work', 'm1', 'n']],
  ['addDailyTask', ['2026-08-15', 'T'], 'addDailyTask', ['2026-08-15', 'T', 'General', null, '']],
  ['addMasterTask', ['T', 'Work', '2026-09-01', 'n'], 'addMasterTask', ['T', 'Work', '2026-09-01', 'n']],
  ['addMasterTask', ['T'], 'addMasterTask', ['T', 'General', null, '']],
  ['markMasterTaskMoved', ['m1', '2026-08-16', 't9'], 'markMasterTaskMoved', ['m1', '2026-08-16', 't9']],
  ['updateDailyTask', ['2026-08-15', 't1', { title: 'x' }], 'updateDailyTask', ['2026-08-15', 't1', { title: 'x' }]],
  ['deleteDailyTask', ['2026-08-15', 't1'], 'deleteDailyTask', ['t1']],
  ['createCalendarEvent', [{ title: 'E' }], 'createCalendarEvent', [{ title: 'E' }]],
  ['setEventRsvp', ['e1', 'yes'], 'setEventRsvp', ['e1', 'yes']],
  ['forwardDailyTask', ['2026-08-15', 't1', '2026-08-16'], 'forwardDailyTask', ['2026-08-15', 't1', '2026-08-16']],
  ['delegateDailyTask', ['2026-08-15', 't1', '2026-08-20', 'Bob'], 'delegateDailyTask', ['2026-08-15', 't1', '2026-08-20', 'Bob']],
  ['updateMasterTask', ['m1', { title: 'x' }], 'updateMasterTask', ['m1', { title: 'x' }]],
  ['deleteMasterTask', ['m1'], 'deleteMasterTask', ['m1']],
  ['forwardMasterTask', ['m1', '2026-08-16'], 'forwardMasterTask', ['m1', '2026-08-16']],
  ['undoMasterForward', ['m1', 'c1', '•'], 'undoMasterForward', ['m1', 'c1', '•']],
  ['getFutureMatrix', [2027], 'getFutureMatrix', [2027]],
  ['addFutureItem', [2027, '2027-03', 'T'], 'addFutureItem', [2027, '2027-03', 'T', 'General']],
  ['updateFutureItemStatus', [2027, '2027-03', 'f1', 'x'], 'updateFutureItemStatus', [2027, '2027-03', 'f1', 'x']],
  ['transferFutureItem', [2027, '2027-03', 'f1', '2027-03-04'], 'transferFutureItem', [2027, '2027-03', 'f1', '2027-03-04', 'A']],
  ['pushFutureItemToNextMonth', [2027, '2027-03', 'f1'], 'pushFutureItemToNextMonth', [2027, '2027-03', 'f1']],
  ['deleteFutureItem', [2027, '2027-03', 'f1'], 'deleteFutureItem', [2027, '2027-03', 'f1']],
  ['saveDailyDocCards', ['2026-08-15', 'new', 'old'], 'saveDailyDocCards', ['2026-08-15', 'new', 'old']],
  ['createDictationScratchDoc', [], 'createDictationScratchDoc', []],
  ['pullDictationScratchText', ['doc1'], 'pullDictationScratchText', ['doc1']],
  ['resolveLinkTitle', ['https://example.com/x'], 'resolveDriveFileTitle', ['https://example.com/x']],
  ['searchArchiveNotes', ['q'], 'searchArchiveNotes', ['q']]
];

function installRun(remoteName, behavior) {
  const calls = [];
  const run = {
    withSuccessHandler(ok) { this.ok = ok; return this; },
    withFailureHandler(no) { this.no = no; return this; }
  };
  run[remoteName] = function (...args) {
    calls.push(args);
    if (behavior === 'fail') this.no(new Error('server said no'));
    else this.ok({ sentinel: remoteName });
  };
  globalThis.window = { google: { script: { run } } };
  return calls;
}

describe('GASBridge google.script.run forwarding', () => {
  afterEach(() => { delete globalThis.window; });

  for (const [method, args, remote, expected] of CASES) {
    it(`${method} forwards to ${remote} and resolves with the server payload`, async () => {
      const calls = installRun(remote, 'ok');
      const got = await new GASBridge(false)[method](...args);
      assert.deepEqual(calls, [expected]);
      assert.deepEqual(got, { sentinel: remote });
    });

    it(`${method} rejects with the server failure`, async () => {
      installRun(remote, 'fail');
      await assert.rejects(new GASBridge(false)[method](...args), /server said no/);
    });
  }

  it('getWebAppUrl resolves the URL, and empty string for an empty result or a failure', async () => {
    const run = {
      withSuccessHandler(ok) { this.ok = ok; return this; },
      withFailureHandler(no) { this.no = no; return this; },
      getWebAppUrl() { this.respond(); }
    };
    globalThis.window = { google: { script: { run } } };
    run.respond = () => run.ok('https://script.google.com/x/exec');
    assert.equal(await new GASBridge(false).getWebAppUrl(), 'https://script.google.com/x/exec');
    run.respond = () => run.ok(null);
    assert.equal(await new GASBridge(false).getWebAppUrl(), '');
    // Current behavior: a server failure is swallowed to '' (callers cannot tell it from "no URL").
    run.respond = () => run.no(new Error('boom'));
    assert.equal(await new GASBridge(false).getWebAppUrl(), '');
  });
});
