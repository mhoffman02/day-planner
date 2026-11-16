/**
 * @file gasFailureInjection.test.js
 * @description TODO A17.5: failure injection for Google APIs. Each main client-facing RPC runs against the REAL
 * gas-app source in a vm while one stubbed service call throws a quota, 403, 404 or timeout error. Contract: the
 * RPC fails loud (throws a user-facing Error, or returns its family's error envelope: Code.gs friendly
 * {success:false,error}, day loaders' warnings, hub makeResult {ok:false,message}) AND the stack reached
 * console.error. Never silent success or empty data presented as success (ADR 0005 addendum).
 * 404 on delete/update of a task is the documented idempotent exception, asserted separately.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile, stubPrimaryTimeZone, toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread } from './helpers/gasFakesHub.js';
import { FAILURE_KINDS, injectFailure, assertFailsLoud, assertUserFacing, stackLines } from './helpers/gasFailures.js';

const KINDS = Object.keys(FAILURE_KINDS);
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DAY = '2026-11-09';
const emptyIter = () => ({ hasNext: () => false, next: () => { throw new Error('empty'); } });

/** Real Code.gs with seeded task + event + Day Planner Drive folder. */
function codeCtx() {
  const ctx = makeGasContext();
  ctx.__fakes.driveFiles.push({ id: 'ROOT', title: 'Day Planner', mimeType: FOLDER_MIME, parents: [] });
  const root = {
    getId: () => 'ROOT',
    getName: () => 'Day Planner',
    getFoldersByName: emptyIter,
    getFilesByName: (name) => {
      const hits = ctx.__fakes.driveFiles.filter((x) => x.title === name && x.parents.some((p) => p.id === 'ROOT'));
      let i = 0;
      return { hasNext: () => i < hits.length, next: () => ({ getId: () => hits[i++].id }) };
    }
  };
  ctx.DriveApp = {
    getFoldersByName: emptyIter,
    getFolderById: (id) => { if (id !== 'ROOT') throw new Error('No item with the given ID'); return root; }
  };
  ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', 'ROOT');
  ctx.__fakes.tasks.push({ id: 't1', title: '[A1] Call vendor', status: 'needsAction', due: DAY + 'T00:00:00.000Z', notes: '' });
  ctx.__fakes.events.push({
    id: 'e1', etag: '"1"', summary: 'Standup', start: { dateTime: DAY + 'T09:00:00-06:00' }, end: { dateTime: DAY + 'T09:30:00-06:00' }, organizer: { self: true }
  });
  stubPrimaryTimeZone(ctx, () => ({ timeZone: 'America/Chicago' }));
  ctx.Calendar.Events.patch = (res, calId, id) => ({ id, ...res });
  ctx.Calendar.Events.remove = () => {};
  loadGasFile(ctx, 'Code.gs');
  return ctx;
}

const notProbe = (calId, params) => !(params && params.fields === 'timeZone');
const eventPayload = { title: 'Standup 2', dateStr: DAY, startTime: '10:00', endTime: '10:45', description: '', location: '' };

/**
 * RPC x injected service call. `when` skips the time-zone probe so the listed call itself fails.
 * `envelope` is how the RPC reports failure when it does not throw.
 */
const CASES = [
  { rpc: 'getDailyData', api: 'Calendar.Events.list', when: notProbe, call: (c) => c.getDailyData(DAY), envelope: 'warnings' },
  { rpc: 'getDailyData (tz probe)', api: 'Calendar.Events.list', call: (c) => c.getDailyData(DAY), envelope: 'warnings' },
  { rpc: 'getDailyData', api: 'Tasks.Tasks.list', call: (c) => c.getDailyData(DAY), envelope: 'warnings' },
  { rpc: 'getDailyData (notes Doc)', api: 'Docs.Documents.get', call: (c) => { c.getDailyData(DAY); return c.getDailyData(DAY); }, envelope: 'warnings', seed: (c) => c.saveDailyDocCards(DAY, '### #index [Work] Plan\n- a') },
  { rpc: 'getDailyDataRange', api: 'Calendar.Events.list', when: notProbe, call: (c) => c.getDailyDataRange(DAY, DAY), envelope: 'warnings' },
  { rpc: 'getDailyDataRange', api: 'Tasks.Tasks.list', call: (c) => c.getDailyDataRange(DAY, DAY), envelope: 'warnings' },
  { rpc: 'getMasterTasks', api: 'Tasks.Tasks.list', call: (c) => c.getMasterTasks('2026-11') },
  { rpc: 'addDailyTask', api: 'Tasks.Tasks.insert', call: (c) => c.addDailyTask(DAY, '[A1] New', 'Work') },
  { rpc: 'updateDailyTask', api: 'Tasks.Tasks.patch', call: (c) => c.updateDailyTask(DAY, 't1', { status: '✓' }), not: ['notFound'] },
  { rpc: 'updateDailyTask', api: 'Tasks.Tasks.get', call: (c) => c.updateDailyTask(DAY, 't1', { notes: 'n' }), not: ['notFound'] },
  { rpc: 'deleteDailyTask', api: 'Tasks.Tasks.remove', call: (c) => c.deleteDailyTask('t1'), not: ['notFound'] },
  { rpc: 'addMasterTask', api: 'Tasks.Tasks.insert', call: (c) => c.addMasterTask('[B1] Plan', 'Work', null, '') },
  { rpc: 'updateCalendarEvent', api: 'Calendar.Events.get', call: (c) => c.updateCalendarEvent('e1', eventPayload, {}) },
  { rpc: 'updateCalendarEvent', api: 'Calendar.Events.patch', call: (c) => c.updateCalendarEvent('e1', eventPayload, {}) },
  { rpc: 'updateCalendarEvent (tz probe)', api: 'Calendar.Events.list', call: (c) => c.updateCalendarEvent('e1', eventPayload, {}) },
  { rpc: 'deleteCalendarEvent', api: 'Calendar.Events.remove', call: (c) => c.deleteCalendarEvent('e1', {}) },
  { rpc: 'saveDailyDocCards', api: 'Docs.Documents.get', call: (c) => c.saveDailyDocCards(DAY, '### #index [Work] Plan\n- a') },
  { rpc: 'saveDailyDocCards', api: 'Docs.Documents.batchUpdate', call: (c) => c.saveDailyDocCards(DAY, '### #index [Work] Plan\n- a'), seed: (c) => c.saveDailyDocCards(DAY, 'first') },
  { rpc: 'getFutureMatrix', api: 'Tasks.Tasks.list', call: (c) => c.getFutureMatrix(2026) }
];

for (const tc of CASES) {
  describe(`${tc.rpc} when ${tc.api} fails`, () => {
    for (const kind of KINDS) {
      if (tc.not && tc.not.includes(kind)) continue;
      it(kind, () => {
        const ctx = codeCtx();
        if (tc.seed) { tc.seed(ctx); ctx.__consoleLines.length = 0; }
        const inj = injectFailure(ctx, tc.api, kind, tc.when ? { when: tc.when } : {});
        assertFailsLoud(ctx, () => tc.call(ctx), { envelope: tc.envelope });
        assert.ok(inj.calls > 0, `${tc.api} was never reached; the case tests nothing`);
      });
    }
  });
}

describe('404 on a task that is already gone is idempotent by design, not a swallowed error', () => {
  it('deleteDailyTask returns true', () => {
    const ctx = codeCtx();
    injectFailure(ctx, 'Tasks.Tasks.remove', 'notFound');
    assert.equal(ctx.deleteDailyTask('t1'), true);
  });
  it('updateDailyTask returns null (caller shows "no longer exists")', () => {
    const ctx = codeCtx();
    injectFailure(ctx, 'Tasks.Tasks.patch', 'notFound');
    assert.equal(ctx.updateDailyTask(DAY, 't1', { title: 'x' }), null);
  });
});

describe('hub RPCs (makeResult envelope, never throw)', () => {
  const hubCases = [
    { rpc: 'getTriageBoard', api: 'Gmail.Users.Threads.list', call: (c) => c._getTriageBoardInternal({}), seed: (c) => addThread(c, { id: 'th1', subject: 'Budget', labels: ['00_AR'] }) },
    { rpc: 'getHubStatus', api: 'Sheets.Spreadsheets.Values.get', call: (c) => c._getHubStatusInternal(), real: true }
  ];
  for (const tc of hubCases) {
    describe(`${tc.rpc} when ${tc.api} fails`, () => {
      for (const kind of KINDS) {
        it(kind, () => {
          const ctx = makeHubContext({ realStores: tc.real === true, features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true } });
          if (tc.seed) tc.seed(ctx);
          const inj = injectFailure(ctx, tc.api, kind);
          const out = assertFailsLoud(ctx, () => tc.call(ctx));
          assert.equal(out.threw, false, 'hub RPCs return the makeResult envelope instead of throwing');
          assert.equal(toHost(out.value).ok, false);
          assert.ok(inj.calls > 0, `${tc.api} was never reached; the case tests nothing`);
        });
      }
    });
  }
});

describe('getTriageBoard when one thread read (Gmail.Users.Threads.get) fails', () => {
  // Documented partial envelope: the board still loads, the failed thread is counted and named in itemErrors.
  for (const kind of KINDS) {
    it(kind, () => {
      const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true } });
      addThread(ctx, { id: 'th1', subject: 'Budget', labels: ['00_AR'] });
      const inj = injectFailure(ctx, 'Gmail.Users.Threads.get', kind);
      const res = toHost(ctx._getTriageBoardInternal({}));
      assert.ok(inj.calls > 0, 'Gmail.Users.Threads.get was never reached; the case tests nothing');
      if (kind === 'quota') { // quota stops the build: ok:false RATE_LIMITED with the friendly retry message
        assert.equal(res.ok, false);
        assert.equal(res.errorCode, 'RATE_LIMITED');
        assertUserFacing(res.message, 'message');
        return;
      }
      assert.equal(res.errors, 1, `failed thread not counted: ${JSON.stringify(res).slice(0, 300)}`);
      assert.equal(res.itemErrors.length, 1);
      assertUserFacing(res.itemErrors[0].message, 'itemErrors[0]');
      assert.ok(stackLines(ctx).length > 0, 'no stack logged for the failed thread:\n' + ctx.__consoleLines.join('\n').slice(0, 400));
    });
  }
});
