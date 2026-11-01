// v_ boundary guards on the hub RPCs (HubController.gs). Hub contract: never throws to the client; a bad
// argument returns the makeResult envelope {ok:false, errorCode:'INVALID_INPUT'} (error transport stays per
// family, validation is uniform via v_). Existing hand checks (badThread_, regexes) keep their own codes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext } from './helpers/gasFakesHub.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));

// [rpc, bad args]
const BAD = [
  ['getTriageBoard', ['inbox']],
  ['getTriageBoard', [[]]],
  ['getMeetingPrep', [42, null]],
  ['getMeetingPrep', ['series', 7]],
  ['getUpcomingMeetingChoices', [123]],
  ['getUpcomingMeetingChoices', [{}]],
  ['routeThreadToTask', [123, {}]],
  ['routeThreadToTask', ['t1', 'nope']],
  ['routeThreadToWaiting', [{}, {}]],
  ['routeThreadToWaiting', ['t1', 5]],
  ['routeThreadToMeeting', [5, 'o1', {}]],
  ['routeThreadToMeeting', ['t1', 5, {}]],
  ['routeThreadToMeeting', ['t1', 'o1', 'x']],
  ['dismissTriageItem', [7, {}]],
  ['dismissTriageItem', ['t1', []]],
  ['archiveTriageThread', [7, {}]],
  ['archiveTriageThread', ['t1', 'x']],
  ['trashTriageThread', [null, {}]],
  ['trashTriageThread', ['t1', 3]],
  ['retryFailedOperation', [9, {}]],
  ['retryFailedOperation', ['GMAIL|t1|TASK', 'x']],
  ['hubSetFeature', [5, true]],
  ['hubSetTasksListId', [5]],
  ['discoverGeminiNotes', [5]],
  ['getProposedMeetingActions', [{}]],
  ['confirmMeetingActions', [5, []]],
  ['confirmMeetingActions', ['o1', 'x']],
];

for (const [rpc, args] of BAD) {
  test(`${rpc} ${JSON.stringify(args)} returns INVALID_INPUT envelope, does not throw`, () => {
    const ctx = makeHubContext();
    let r;
    assert.doesNotThrow(() => { r = call(ctx, rpc, ...args); });
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'INVALID_INPUT');
    assert.ok(r.message.startsWith(`${rpc}(`), `expected a v_ guard message, got: ${r.message}`);
  });
}

// Real client shapes (Script.html hubRpc passes opts || {}, occurrenceId || null) must get past the guard.
test('real client arg shapes still pass the guards', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, DRY_RUN: false } });
  const pass = (rpc, ...args) => {
    let r;
    assert.doesNotThrow(() => { r = call(ctx, rpc, ...args); }, `${rpc} threw`);
    assert.ok(!String(r && r.message).startsWith(`${rpc}(`), `${rpc} guard rejected a valid call: ${r && r.message}`);
  };
  pass('getTriageBoard');
  pass('getTriageBoard', {});
  pass('getTriageBoard', null);
  pass('getMeetingPrep', 'series-a', null);
  pass('getMeetingPrep', 'series-a');
  pass('getUpcomingMeetingChoices', 'abc123');
  pass('routeThreadToTask', 'abc123', {});
  pass('routeThreadToTask', 'abc123');
  pass('routeThreadToWaiting', 'abc123', {});
  pass('routeThreadToMeeting', 'abc123', null, {});
  pass('dismissTriageItem', 'abc123', {});
  pass('archiveTriageThread', 'abc123', {});
  pass('trashTriageThread', 'abc123', {});
  pass('retryFailedOperation', 'GMAIL|abc123|TASK', {});
  pass('hubSetFeature', 'DRY_RUN', false);
  pass('hubSetTasksListId', '@default');
  pass('discoverGeminiNotes', 'evt1');
  pass('getProposedMeetingActions', 'evt1');
  pass('confirmMeetingActions', 'evt1', []);
  pass('confirmMeetingActions', 'evt1');
});

test('guard failures name the function and param', () => {
  const r = call(makeHubContext(), 'routeThreadToTask', 123456789, {});
  assert.match(r.message, /routeThreadToTask/);
  assert.match(r.message, /threadId/);
});

test('non-validation errors still propagate (rejectInvalid_ rethrows)', () => {
  const ctx = makeHubContext();
  ctx.DPEngines = { ...ctx.DPEngines, v_: { guard() { throw new TypeError('boom'); } } };
  assert.throws(() => ctx._routeThreadToTaskInternal('t1', {}), /boom/);
});
