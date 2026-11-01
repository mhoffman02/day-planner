// Boundary guards on Code.gs RPC entry points: a bad argument must throw a v_ ValidationError
// (message names the function and param, never echoes the value) before any service is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile, loadEngines } from './helpers/gasRuntimeStubs.js';

function ctx() {
  const c = makeGasContext();
  loadEngines(c);
  loadGasFile(c, 'Code.gs');
  return c;
}

// [rpc, bad args, expected param in the ValidationError]
const BAD = [
  ['getDailyData', [123], 'dateStr'],
  ['getDailyData', ['tomorrow'], 'dateStr'],
  ['getDailyDataRange', ['2026-11-01', 'x'], 'endDateStr'],
  ['addDailyTask', ['2026-11-01', 42], 'title'],
  ['addDailyTask', ['bad', 'T'], 'dateStr'],
  ['updateDailyTask', ['', 7, {}], 'taskId'],
  ['updateDailyTask', ['', 't1', 'nope'], 'updates'],
  ['deleteDailyTask', [null], 'taskId'],
  ['getMasterTasks', [{}], 'monthYearStr'],
  ['addMasterTask', [null], 'title'],
  ['updateMasterTask', ['t1', []], 'updates'],
  ['deleteMasterTask', [{}], 'taskId'],
  ['markMasterTaskMoved', ['m1', 5, 't2'], 'targetDateStr'],
  ['forwardDailyTask', ['2026-11-01', 't1', 'soon'], 'targetDateStr'],
  ['forwardMasterTask', ['m1', 'soon'], 'targetDateStr'],
  ['delegateDailyTask', ['2026-11-01', 't1', '2026-11-02', 5], 'owner'],
  ['undoMasterForward', ['m1', {}, '•'], 'copyTaskId'],
  ['saveDailyDocCards', ['bad', 'note', ''], 'dateStr'],
  ['setEventRsvp', ['e1', 'maybe'], 'response'],
  ['searchArchiveNotes', [{}], 'query'],
  ['searchAcrossAllMonthlyDocs', [{}], 'query'],
  ['addFutureItem', [2026, 'Nov', 'T'], 'monthKey'],
  ['addFutureItem', [2026, '2026-11', 7], 'title'],
  ['addFutureItem', [2026, '2026-11', 'T', 5], 'category'],
  ['addFutureItem', [2026, '2026-11', 'T', 'General', 'x'], 'day'],
  ['updateFutureItemStatus', [2026, '2026-11', 7, '•'], 'itemId'],
  ['updateFutureItemStatus', [2026, '2026-11', 'f1', {}], 'status'],
  ['transferFutureItem', [2026, '2026-11', 'f1', 'soon'], 'dateStr'],
  ['transferFutureItem', [2026, '2026-11', 'f1', '2026-11-02', 'Z'], 'priorityGroup'],
  ['pushFutureItemToNextMonth', [2026, 'bad', 'f1'], 'monthKey'],
  ['deleteFutureItem', [2026, '2026-11', null], 'itemId'],
  ['getFutureMatrix', [{}], 'year'],
];

for (const [rpc, args, param] of BAD) {
  test(`${rpc} rejects bad ${param}`, () => {
    const c = ctx();
    assert.throws(() => c[rpc](...args), (err) => err.name === 'ValidationError' && err.param === param && err.fnName === rpc);
  });
}

// Valid shapes may still fail downstream (stub has no such task); only a ValidationError is a guard bug.
function passesGuard(fn) {
  try {
    fn();
  } catch (err) {
    assert.notEqual(err.name, 'ValidationError', `guard rejected a valid call: ${err.message}`);
  }
}

test('valid and optional/null args still pass the guards', () => {
  const c = ctx();
  passesGuard(() => c.getDailyData('2026-11-01'));
  passesGuard(() => c.getFutureMatrix(2026));
  passesGuard(() => c.addFutureItem('2026', '2026-11', 'T', null, undefined));
  passesGuard(() => c.transferFutureItem(2026, '2026-11', 'f1', '2026-11-02', 'b'));
  passesGuard(() => c.addDailyTask('2026-11-01', 'T', null, null, undefined));
  passesGuard(() => c.updateDailyTask('', 't1', { starred: true }));
  passesGuard(() => c.addMasterTask('T', undefined, null, undefined));
  passesGuard(() => c.searchArchiveNotes(null));
  passesGuard(() => c.searchAcrossAllMonthlyDocs(undefined));
  passesGuard(() => c.getMasterTasks('November 2026'));
  passesGuard(() => c.delegateDailyTask('2026-11-01', 't1', '2026-11-02', null));
  passesGuard(() => c.saveDailyDocCards('2026-11-01', '', null));
});

// ── createCalendarEvent / include (throw like their siblings) ─────────────────
for (const bad of [null, 5, 'x', []]) {
  test(`createCalendarEvent rejects non-object payload ${JSON.stringify(bad)} with a ValidationError`, () => {
    const c = ctx();
    assert.throws(() => c.createCalendarEvent(bad), (err) => err.name === 'ValidationError' && err.param === 'payload' && err.fnName === 'createCalendarEvent');
  });
}

for (const bad of ['Nope', '../Code', '', 7, null, undefined]) {
  test(`include rejects ${JSON.stringify(bad)} (not a known template)`, () => {
    const c = ctx();
    assert.throws(() => c.include(bad), (err) => err.name === 'ValidationError' && err.param === 'filename' && err.fnName === 'include');
  });
}

test('include accepts every template name Index.html passes', () => {
  const c = ctx();
  for (const name of ['Styles', 'Script', 'About', 'Tutorial']) passesGuard(() => c.include(name));
});

// ── friendly {success,error} RPCs keep their return shape (never throw on bad type) ─────────────
const FRIENDLY = [
  ['resolveDriveFileTitle', [5]],
  ['resolveDriveFileTitle', [{}]],
  ['pullDictationScratchText', [5]],
  ['pullDictationScratchText', [{}]],
  ['validateAndSaveFolderUrl', [5]],
  ['validateAndSaveFolderUrl', [{}]],
];
for (const [rpc, args] of FRIENDLY) {
  test(`${rpc} ${JSON.stringify(args)} returns {success:false,error} instead of throwing`, () => {
    const c = ctx();
    let r;
    assert.doesNotThrow(() => { r = JSON.parse(JSON.stringify(c[rpc](...args))); });
    assert.equal(r.success, false);
    assert.equal(typeof r.error, 'string');
    assert.ok(!r.error.startsWith(`${rpc}(`), 'friendly message, not the raw guard text');
  });
}

test('friendly RPCs still take the empty/undefined/null inputs the clients send', () => {
  const c = ctx();
  for (const rpc of ['resolveDriveFileTitle', 'pullDictationScratchText', 'validateAndSaveFolderUrl']) {
    for (const v of ['', undefined, null]) {
      const r = JSON.parse(JSON.stringify(c[rpc](v)));
      assert.equal(r.success, false, `${rpc}(${String(v)})`);
      assert.equal(typeof r.error, 'string');
    }
  }
});
