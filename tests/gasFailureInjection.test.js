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
import { makeHubContext, addThread, addCoreOccurrences, runFilterLearner } from './helpers/gasFakesHub.js';
import { discoverRpcs } from './helpers/gasRpcDiscovery.js';
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

describe('getDailyData when the notes Doc read fails', () => {
  for (const kind of KINDS) {
    it(kind + ': flags noteLoadFailed with empty noteContent (no fake note text) and keeps the warning', () => {
      const ctx = codeCtx();
      ctx.getDailyData(DAY);
      ctx.__consoleLines.length = 0;
      injectFailure(ctx, 'Docs.Documents.get', kind);
      const res = toHost(ctx.getDailyData(DAY));
      assert.equal(res.noteLoadFailed, true);
      assert.equal(res.noteContent, '');
      assert.ok(res.warnings.length > 0, 'warning kept');
    });
  }
});

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

// ---- A17.5 full coverage: every other Code.gs RPC that touches a Google service ----------------------------
const FUTURE = '2026-12';
const seedGoal = (c) => { c.__goal = toHost(c.saveGoal({ title: 'Run', horizon: '1y' })); c.__consoleLines.length = 0; };
const seedGoalsList = (c) => { c.getGoals(); c.__consoleLines.length = 0; };
const seedForwardable = (c) => { c.__consoleLines.length = 0; };
const seedGuestEvent = (c) => {
  c.__fakes.events[0].attendees = [{ email: 'tester@example.com', self: true, responseStatus: 'needsAction' }];
  c.Calendar.Events.patch = (res, calId, id) => ({ id, attendees: res.attendees });
};
const seedScratch = (c) => { c.__scratch = toHost(c.createDictationScratchDoc()); c.__consoleLines.length = 0; };
const newEvent = { title: 'Review', dateStr: DAY, startTime: '11:00', endTime: '11:30', description: '', location: '' };

/**
 * Code.gs RPCs beyond the first matrix. `not` skips kinds that are an intended idempotent outcome (asserted in the
 * exceptions block below). `envelope` is how the RPC reports when it does not throw: Code.gs friendly {success:false,error}
 * and {ok:false,error} are both accepted by assertFailsLoud.
 */
const MORE_CASES = [
  { rpc: 'getGoals', api: 'Tasks.Tasklists.list', call: (c) => c.getGoals() },
  { rpc: 'getGoals', api: 'Tasks.Tasks.list', seed: seedGoalsList, call: (c) => c.getGoals() },
  { rpc: 'saveGoal', api: 'Tasks.Tasklists.list', call: (c) => c.saveGoal({ title: 'Run', horizon: '1y' }) },
  { rpc: 'saveGoal', api: 'Tasks.Tasks.insert', seed: seedGoalsList, call: (c) => c.saveGoal({ title: 'Run', horizon: '1y' }) },
  { rpc: 'saveGoal', api: 'Tasks.Tasks.patch', seed: seedGoal, call: (c) => c.saveGoal({ ...c.__goal, title: 'Run more' }) },
  { rpc: 'deleteGoal', api: 'Tasks.Tasks.remove', seed: seedGoal, call: (c) => c.deleteGoal(c.__goal.id) },
  { rpc: 'deleteGoal', api: 'Tasks.Tasks.list', seed: seedGoal, call: (c) => c.deleteGoal(c.__goal.id) },
  { rpc: 'addGoalStepToToday', api: 'Tasks.Tasks.get', seed: seedGoal, call: (c) => c.addGoalStepToToday(c.__goal.id, '[A1] Step', DAY) },
  { rpc: 'addGoalStepToToday', api: 'Tasks.Tasks.insert', seed: seedGoal, call: (c) => c.addGoalStepToToday(c.__goal.id, '[A1] Step', DAY) },
  { rpc: 'addGoalStepToFuture', api: 'Tasks.Tasks.get', seed: seedGoal, call: (c) => c.addGoalStepToFuture(c.__goal.id, 'Step', FUTURE) },
  { rpc: 'addGoalStepToFuture', api: 'Tasks.Tasks.insert', seed: seedGoal, call: (c) => c.addGoalStepToFuture(c.__goal.id, 'Step', FUTURE) },
  { rpc: 'addFutureItem', api: 'Tasks.Tasks.insert', call: (c) => c.addFutureItem(2026, FUTURE, 'Plan trip', 'Work', null) },
  { rpc: 'updateFutureItemStatus', api: 'Tasks.Tasks.patch', not: ['notFound'], call: (c) => c.updateFutureItemStatus(2026, FUTURE, 't1', '✓') },
  { rpc: 'updateFutureItemStatus', api: 'Tasks.Tasks.get', not: ['notFound'], call: (c) => c.updateFutureItemStatus(2026, FUTURE, 't1', '✓') },
  { rpc: 'transferFutureItem', api: 'Tasks.Tasks.patch', not: ['notFound'], call: (c) => c.transferFutureItem(2026, FUTURE, 't1', DAY, 'A') },
  { rpc: 'transferFutureItem', api: 'Tasks.Tasks.get', not: ['notFound'], call: (c) => c.transferFutureItem(2026, FUTURE, 't1', DAY, 'A') },
  { rpc: 'pushFutureItemToNextMonth', api: 'Tasks.Tasks.patch', not: ['notFound'], call: (c) => c.pushFutureItemToNextMonth(2026, FUTURE, 't1') },
  { rpc: 'deleteFutureItem', api: 'Tasks.Tasks.remove', not: ['notFound'], call: (c) => c.deleteFutureItem(2026, FUTURE, 't1') },
  { rpc: 'deleteMasterTask', api: 'Tasks.Tasks.remove', not: ['notFound'], call: (c) => c.deleteMasterTask('t1') },
  { rpc: 'updateMasterTask', api: 'Tasks.Tasks.patch', not: ['notFound'], call: (c) => c.updateMasterTask('t1', { status: '✓' }) },
  { rpc: 'updateMasterTask', api: 'Tasks.Tasks.get', not: ['notFound'], call: (c) => c.updateMasterTask('t1', { notes: 'n' }) },
  { rpc: 'markMasterTaskMoved', api: 'Tasks.Tasks.get', call: (c) => c.markMasterTaskMoved('t1', DAY, 'x9') },
  { rpc: 'markMasterTaskMoved', api: 'Tasks.Tasks.patch', call: (c) => c.markMasterTaskMoved('t1', DAY, 'x9') },
  { rpc: 'forwardDailyTask', api: 'Tasks.Tasks.get', seed: seedForwardable, call: (c) => c.forwardDailyTask(DAY, 't1', '2026-11-10') },
  { rpc: 'forwardDailyTask', api: 'Tasks.Tasks.insert', call: (c) => c.forwardDailyTask(DAY, 't1', '2026-11-10') },
  { rpc: 'forwardDailyTask', api: 'Tasks.Tasks.patch', call: (c) => c.forwardDailyTask(DAY, 't1', '2026-11-10') },
  { rpc: 'delegateDailyTask', api: 'Tasks.Tasks.get', call: (c) => c.delegateDailyTask(DAY, 't1', '2026-11-12', 'Pat') },
  { rpc: 'delegateDailyTask', api: 'Tasks.Tasks.insert', call: (c) => c.delegateDailyTask(DAY, 't1', '2026-11-12', 'Pat') },
  { rpc: 'delegateDailyTask', api: 'Tasks.Tasks.patch', call: (c) => c.delegateDailyTask(DAY, 't1', '2026-11-12', 'Pat') },
  { rpc: 'forwardMasterTask', api: 'Tasks.Tasks.get', call: (c) => c.forwardMasterTask('t1', '2026-11-10') },
  { rpc: 'forwardMasterTask', api: 'Tasks.Tasks.insert', call: (c) => c.forwardMasterTask('t1', '2026-11-10') },
  { rpc: 'forwardMasterTask', api: 'Tasks.Tasks.patch', call: (c) => c.forwardMasterTask('t1', '2026-11-10') },
  { rpc: 'undoMasterForward', api: 'Tasks.Tasks.remove', not: ['notFound'], call: (c) => c.undoMasterForward('t1', 't1', '•') },
  { rpc: 'undoMasterForward', api: 'Tasks.Tasks.get', call: (c) => c.undoMasterForward('t1', 'gone', '•'), seed: (c) => { c.__fakes.tasks.push({ id: 'gone', title: 'copy', status: 'needsAction' }); } },
  { rpc: 'undoMasterForward', api: 'Tasks.Tasks.patch', call: (c) => c.undoMasterForward('t1', 'gone', '•'), seed: (c) => { c.__fakes.tasks.push({ id: 'gone', title: 'copy', status: 'needsAction' }); } },
  { rpc: 'createCalendarEvent', api: 'Calendar.Events.list', call: (c) => c.createCalendarEvent(newEvent) },
  { rpc: 'createCalendarEvent', api: 'Calendar.Events.insert', when: undefined, seed: (c) => { c.Calendar.Events.insert = (r) => ({ id: 'new1', ...r }); }, call: (c) => c.createCalendarEvent(newEvent) },
  { rpc: 'setEventRsvp', api: 'Calendar.Events.get', call: (c) => c.setEventRsvp('e1', 'accepted') },
  { rpc: 'setEventRsvp', api: 'Calendar.Events.patch', seed: seedGuestEvent, call: (c) => c.setEventRsvp('e1', 'accepted') },
  { rpc: 'getDayDocLink', api: 'Docs.Documents.get', seed: (c) => c.saveDailyDocCards(DAY, '### #index [Work] Plan\n- a'), call: (c) => c.getDayDocLink(DAY) },
  { rpc: 'searchArchiveNotes', api: 'Drive.Files.list', call: (c) => c.searchArchiveNotes('budget') },
  { rpc: 'createDictationScratchDoc', api: 'Drive.Files.insert', call: (c) => c.createDictationScratchDoc() },
  { rpc: 'createDictationScratchDoc', api: 'Docs.Documents.batchUpdate', call: (c) => c.createDictationScratchDoc() },
  { rpc: 'pullDictationScratchText', api: 'Docs.Documents.get', seed: seedScratch, call: (c) => c.pullDictationScratchText(c.__scratch.docId) },
  { rpc: 'resolveDriveFileTitle', api: 'Drive.Files.get', call: (c) => c.resolveDriveFileTitle('https://docs.google.com/document/d/abc123/edit') },
  { rpc: 'validateAndSaveFolderUrl', api: 'DriveApp.getFolderById', call: (c) => c.validateAndSaveFolderUrl('ROOT') }
];

for (const tc of MORE_CASES) {
  describe(`${tc.rpc} when ${tc.api} fails`, () => {
    for (const kind of KINDS) {
      if (tc.not && tc.not.includes(kind)) continue;
      it(kind, () => {
        const ctx = codeCtx();
        if (tc.seed) { tc.seed(ctx); ctx.__consoleLines.length = 0; }
        const inj = injectFailure(ctx, tc.api, kind);
        assertFailsLoud(ctx, () => tc.call(ctx));
        assert.ok(inj.calls > 0, `${tc.api} was never reached; the case tests nothing`);
      });
    }
  });
}

/** RPC names with a matrix case above (suffixes like " (tz probe)" stripped). */
// ---- A17.5 hub RPCs not in the first hub table. Same contract: makeResult {ok:false,message}, never a throw, stack logged. ----
const SERIES = 'NCMMS_CORE';
const hubTask = (c) => addThread(c, { id: 'a1', labels: ['INBOX', '00_AR', '🎯/Task'], subject: 'Approval needed' });
const HUB_MORE = [
  { rpc: 'archiveTriageThread', api: 'Gmail.Users.Threads.modify', seed: hubTask, call: (c) => c._archiveTriageThreadInternal('a1') },
  { rpc: 'noteTriageThread', api: 'Gmail.Users.Labels.list', seed: hubTask, call: (c) => c._noteTriageThreadInternal('a1') },
  { rpc: 'rsvpTriageThread', api: 'Gmail.Users.Threads.get', seed: hubTask, call: (c) => c._rsvpTriageThreadInternal('a1', 'accepted') },
  { rpc: 'trashTriageThread', api: 'Gmail.Users.Threads.trash', seed: hubTask, call: (c) => c._trashTriageThreadInternal('a1') },
  { rpc: 'routeThreadToTask', api: 'Gmail.Users.Threads.get', seed: hubTask, call: (c) => c._routeThreadToTaskInternal('a1', {}) },
  { rpc: 'routeThreadToWaiting', api: 'Gmail.Users.Threads.get', seed: hubTask, call: (c) => c._routeThreadToWaitingInternal('a1', {}) },
  { rpc: 'routeThreadToMeeting', api: 'Gmail.Users.Threads.get', seed: hubTask, call: (c) => c._routeThreadToMeetingInternal('a1', null, { seriesKey: SERIES, mode: 'current' }) },
  { rpc: 'getUpcomingMeetingChoices', api: 'Gmail.Users.Threads.get', seed: hubTask, call: (c) => c._getUpcomingMeetingChoicesInternal('a1') },
  { rpc: 'hubSetupLabels', api: 'Gmail.Users.Labels.list', call: (c) => c._hubSetupLabelsInternal() },
  { rpc: 'getMeetingPrep', api: 'Calendar.Events.list', seed: (c) => addCoreOccurrences(c), call: (c) => c._getMeetingPrepInternal(SERIES, null) },
  { rpc: 'getFiledEmails', api: 'Sheets.Spreadsheets.Values.get', real: true, call: (c) => c._getFiledEmailsInternal('2026-10-06') },
  { rpc: 'dismissTriageItem', api: 'Sheets.Spreadsheets.Values.get', real: true, seed: hubTask, call: (c) => c._dismissTriageItemInternal('a1', {}) },
  { rpc: 'retryFailedOperation', api: 'Sheets.Spreadsheets.Values.get', real: true, call: (c) => c._retryFailedOperationInternal('GMAIL|a1|TASK', {}) },
  { rpc: 'processWorkflowQueue', api: 'Gmail.Users.Threads.list', seed: hubTask, call: (c) => c._processWorkflowQueueInternal() },
  { rpc: 'getHubSheetLink', api: 'Sheets.Spreadsheets.get', real: true, call: (c) => c._getHubSheetLinkInternal() },
  { rpc: 'setupHub', api: 'Sheets.Spreadsheets.get', real: true, call: (c) => c._setupHubInternal() }
];
for (const tc of HUB_MORE) {
  describe(`${tc.rpc} when ${tc.api} fails`, () => {
    for (const kind of KINDS) {
      it(kind, () => {
        const ctx = makeHubContext({ realStores: tc.real === true, features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true, DRY_RUN: false, NOTES: true, NCMMS_CORE_PILOT: true } });
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

// Filter learner: needs a provisioned hub Sheet and mail samples, so it gets its own seed.
const filterCtx = () => {
  const ctx = makeHubContext({ realStores: true, features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true } });
  const h = ctx.__hub.gmail;
  ['🎯/Task', '🎯/Read'].forEach((n) => h.labelId(n));
  for (let i = 1; i <= 4; i++) addThread(ctx, { id: `task${i}`, archived: true, labels: ['🎯/Task'], from: 'NCMMS <noreply@ncmms.gov>', subject: `Work order ${i} has been assigned to you` });
  for (let i = 1; i <= 5; i++) addThread(ctx, { id: `in${i}`, labels: ['INBOX'], from: `Colleague ${i} <c${i}@agency.gov>`, subject: `Lunch plans ${i}` });
  h.queryHits['from:(noreply@ncmms.gov)'] = ['task1', 'task2', 'task3', 'task4'];
  return ctx;
};
describe('hubSuggestFilters when Gmail.Users.Messages.list fails', () => {
  for (const kind of KINDS) {
    it(kind, () => {
      const ctx = filterCtx();
      const inj = injectFailure(ctx, 'Gmail.Users.Messages.list', kind);
      if (kind === 'quota') {
        // Intended: a Gmail quota stop is a pause, not a failure. The learner logs the stack and the next one-minute tick resumes.
        const r = toHost(ctx._hubSuggestFiltersInternal());
        assert.equal(r.ok, true);
        assert.equal(r.running, true);
        assert.ok(stackLines(ctx).length > 0, 'quota pause must still log its stack');
      } else {
        const out = assertFailsLoud(ctx, () => ctx._hubSuggestFiltersInternal());
        assert.equal(out.threw, false);
        assert.equal(toHost(out.value).ok, false);
      }
      assert.ok(inj.calls > 0, 'Gmail.Users.Messages.list was never reached; the case tests nothing');
    });
  }
});
describe('hubCreateSelectedFilters when Gmail.Users.Settings.Filters.list fails', () => {
  for (const kind of KINDS) {
    it(kind, () => {
      const ctx = filterCtx();
      runFilterLearner(ctx);
      const sheet = Object.values(ctx.__fakes.sheets)[0].tabs.find((t) => t.title === 'Filter Suggestions');
      const create = sheet.rows[0].indexOf('Create?');
      sheet.rows.slice(1).forEach((r) => { if (r[0]) r[create] = 'TRUE'; });
      const inj = injectFailure(ctx, 'Gmail.Users.Settings.Filters.list', kind);
      const out = assertFailsLoud(ctx, () => ctx._hubCreateSelectedFiltersInternal());
      assert.equal(out.threw, false);
      assert.equal(toHost(out.value).ok, false);
      assert.ok(inj.calls > 0, 'Gmail.Users.Settings.Filters.list was never reached; the case tests nothing');
    });
  }
});

// Doc action items: DriveV3 (drive.readonly) is a fake here; the repo is the real DriveFollowupRepository.gs.
const FILE_A = 'FileAAAAAAAAAA1';
const docCtx = (real) => {
  const ctx = makeHubContext({ realStores: real === true, features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true, DRY_RUN: false, DOC_ACTION_ITEMS: true } });
  loadGasFile(ctx, 'DriveFollowupRepository.gs');
  ctx.DriveV3 = {
    Files: { list: () => ({ files: [{ id: FILE_A, name: 'Budget plan', modifiedTime: '2026-11-04T10:00:00Z' }] }), get: (id) => ({ id, name: 'Budget plan', mimeType: 'application/vnd.google-apps.document' }) },
    Comments: { list: () => ({ comments: [{ id: 'c1', assigneeEmailAddress: 'me@example.test', content: 'Update the table', author: { displayName: 'Ann' }, modifiedTime: '2026-11-04T10:00:00Z' }] }) }
  };
  return ctx;
};
const DOC_CASES = [
  { rpc: 'getDocActionItems', api: 'DriveV3.Files.list', call: (c) => c._getDocActionItemsInternal(true) },
  { rpc: 'routeDocItemToTask', api: 'DriveV3.Files.get', call: (c) => c._routeDocItemToTaskInternal(`${FILE_A}~c1`, {}) },
  { rpc: 'dismissDocItem', api: 'Sheets.Spreadsheets.Values.get', real: true, call: (c) => c._dismissDocItemInternal(`${FILE_A}~c1`, {}) },
  { rpc: 'dismissDocItems', api: 'Sheets.Spreadsheets.Values.get', real: true, call: (c) => c._dismissDocItemsInternal([`${FILE_A}~c1`], {}) }
];
for (const tc of DOC_CASES) {
  describe(`${tc.rpc} when ${tc.api} fails`, () => {
    for (const kind of KINDS) {
      it(kind, () => {
        const ctx = docCtx(tc.real);
        const inj = injectFailure(ctx, tc.api, kind);
        const out = assertFailsLoud(ctx, () => tc.call(ctx));
        assert.equal(out.threw, false);
        assert.equal(toHost(out.value).ok, false);
        assert.ok(inj.calls > 0, `${tc.api} was never reached; the case tests nothing`);
      });
    }
  });
}

// 404 means the task is already gone: the caller's goal (deleted, or "no longer exists") is met or reported, so these RPCs
// return a documented value instead of failing. Every other kind (quota, 403, timeout) fails loud in the matrix above.
const IDEMPOTENT_404 = [
  ['updateFutureItemStatus', 'Tasks.Tasks.patch', null, 'caller shows "no longer exists"'],
  ['updateFutureItemStatus', 'Tasks.Tasks.get', null, 'caller shows "no longer exists"'],
  ['transferFutureItem', 'Tasks.Tasks.patch', null, 'item vanished: nothing to transfer, caller refreshes'],
  ['transferFutureItem', 'Tasks.Tasks.get', null, 'item vanished: nothing to transfer, caller refreshes'],
  ['pushFutureItemToNextMonth', 'Tasks.Tasks.patch', null, 'item vanished: nothing to push, caller refreshes'],
  ['deleteFutureItem', 'Tasks.Tasks.remove', true, 'delete of an already-deleted item is success'],
  ['deleteMasterTask', 'Tasks.Tasks.remove', true, 'delete of an already-deleted task is success'],
  ['updateMasterTask', 'Tasks.Tasks.patch', null, 'caller shows "no longer exists"'],
  ['updateMasterTask', 'Tasks.Tasks.get', null, 'caller shows "no longer exists"']
];
describe('404 idempotent exceptions for the Future and Master task RPCs', () => {
  for (const [rpc, api, expected, why] of IDEMPOTENT_404) {
    it(`${rpc} when ${api} is 404: returns ${JSON.stringify(expected)} (${why})`, () => {
      const tc = MORE_CASES.find((c) => c.rpc === rpc && c.api === api);
      assert.ok(tc, `no matrix case for ${rpc} ${api}`);
      const ctx = codeCtx();
      if (tc.seed) { tc.seed(ctx); ctx.__consoleLines.length = 0; }
      const inj = injectFailure(ctx, api, 'notFound');
      assert.deepEqual(toHost(tc.call(ctx)), expected);
      assert.ok(inj.calls > 0, `${api} was never reached; the case tests nothing`);
    });
  }
  it('undoMasterForward when the forwarded copy is already gone (remove 404): restores the original, clears the move links', () => {
    const tc = MORE_CASES.find((c) => c.rpc === 'undoMasterForward' && c.api === 'Tasks.Tasks.remove');
    const ctx = codeCtx();
    const inj = injectFailure(ctx, 'Tasks.Tasks.remove', 'notFound');
    assert.deepEqual(toHost(tc.call(ctx)), { id: 't1', status: '•', movedTo: null, movedTaskId: null });
    assert.ok(inj.calls > 0);
  });
});

// Hub config RPCs: Config tab reads/writes go to the hub Sheet.
const HUB_CONFIG = [
  { rpc: 'hubSetFeature', call: (c) => c._hubSetFeatureInternal('DRY_RUN', true) },
  { rpc: 'hubSetTasksListId', call: (c) => c._hubSetTasksListIdInternal('@default') }
];
for (const tc of HUB_CONFIG) {
  describe(`${tc.rpc} when Sheets.Spreadsheets.Values.get fails`, () => {
    for (const kind of KINDS) {
      it(kind, () => {
        const ctx = makeHubContext({ realStores: true, features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true } });
        const inj = injectFailure(ctx, 'Sheets.Spreadsheets.Values.get', kind);
        const out = assertFailsLoud(ctx, () => tc.call(ctx));
        assert.equal(out.threw, false);
        assert.equal(toHost(out.value).ok, false);
        assert.ok(inj.calls > 0, 'Sheets.Spreadsheets.Values.get was never reached; the case tests nothing');
      });
    }
  });
}

const COVERED = new Set([...CASES, ...MORE_CASES, ...HUB_MORE, ...DOC_CASES, ...HUB_CONFIG].map((c) => c.rpc.replace(/ \(.*\)$/, '')).concat(['getTriageBoard', 'getHubStatus', 'hubSuggestFilters', 'hubCreateSelectedFilters']));
/** RPCs deliberately outside the matrix, each with the reason. */
const EXEMPT = {
  include: 'HtmlService page include, no Google data API; on a read error it logs the stack (logError) and returns an HTML comment',
  logFromClient: 'client telemetry sink: writes to the server log only, calls no Google service',
  hubFilterLearnStatus: 'reads learner state from CacheService only (documented "no Gmail calls"); no Google API to fail',
  discoverGeminiNotes: 'stub: always ok:false NOT_IMPLEMENTED or FLAG_OFF, calls no Google service',
  getProposedMeetingActions: 'stub: always ok:false NOT_IMPLEMENTED or FLAG_OFF, calls no Google service',
  confirmMeetingActions: 'stub: always ok:false NOT_IMPLEMENTED or FLAG_OFF, calls no Google service'
};

describe('A17.5 coverage gate: every client-callable RPC is in the failure matrix or explicitly exempt', () => {
  it('no uncovered RPC', () => {
    const rpcs = discoverRpcs();
    assert.ok(rpcs.length > 40, `discovery looks broken: ${rpcs.length} RPCs`);
    const uncovered = rpcs.filter((n) => !COVERED.has(n) && !(n in EXEMPT));
    assert.deepEqual(uncovered, [], `RPCs with no failure-injection case and no EXEMPT reason: ${uncovered.join(', ')}`);
  });
  it('EXEMPT and COVERED hold no stale names', () => {
    const rpcs = new Set(discoverRpcs());
    const stale = [...Object.keys(EXEMPT), ...COVERED].filter((n) => !rpcs.has(n));
    assert.deepEqual(stale, [], `not client-callable RPCs any more: ${stale.join(', ')}`);
    assert.deepEqual(Object.keys(EXEMPT).filter((n) => COVERED.has(n)), [], 'both covered and exempt');
  });
});
