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
