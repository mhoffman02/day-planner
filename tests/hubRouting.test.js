/**
 * @file hubRouting.test.js
 * @description Exit criteria (a)-(i) for the Gmail/Meeting hub services, run against the REAL
 * gas-app .gs files in a vm with fakes (tests/helpers/gasFakesHub.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread, addCoreOccurrences, TZ } from './helpers/gasFakesHub.js';

const LIVE = { GMAIL_ROUTER: true, DRY_RUN: false };
const run = (ctx) => toHost(ctx._processWorkflowQueueInternal());
const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const keyTask = 'GMAIL|t1|TASK';

test('(a) a 🎯/Task thread yields exactly one Task; rerun creates zero more', () => {
  const ctx = makeHubContext({ features: LIVE });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'], subject: 'Review the SOW' });
  const r1 = run(ctx);
  assert.equal(r1.ok, true);
  assert.equal(ctx.__hub.tasks.items.length, 1);
  const task = ctx.__hub.tasks.items[0];
  assert.match(task.title, /Review the SOW/);
  assert.match(task.notes, /Gmail: https:\/\/mail\.google\.com\/mail\/#all\/t1/);
  assert.equal(ctx.__hub.tasks.lastList, 'LIST1');
  assert.equal(ctx.__hub.ledger.rows.get(keyTask).Status, 'DONE');
  run(ctx);
  run(ctx);
  assert.equal(ctx.__hub.tasks.items.length, 1);
  assert.equal(ctx.__hub.tasks.inserts, 1);
});

test('(a) Tasks beyond the first page and completed Tasks are searched before any create', () => {
  const ctx = makeHubContext({ features: LIVE });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  run(ctx);
  ctx.__hub.tasks.items[0].status = 'completed';
  for (let i = 0; i < 250; i += 1) ctx.__hub.tasks.items.push({ id: `filler${i}`, status: 'needsAction', title: 'x' });
  ctx.__hub.ledger.rows.clear();
  run(ctx);
  assert.equal(ctx.__hub.tasks.inserts, 1, 'found the completed Task by opKey across pages');
});

test('(b) 🎯/Task-Today is due today in America/Los_Angeles (UTC already tomorrow)', () => {
  const ctx = makeHubContext({ features: LIVE, now: '2026-10-07T03:00:00Z' });
  addThread(ctx, { id: 't1', labels: ['🎯/Task-Today'] });
  run(ctx);
  assert.equal(TZ, 'America/Los_Angeles');
  assert.equal(ctx.__hub.tasks.items[0].due, '2026-10-06T00:00:00.000Z');
});

test('(b) a thread with both Task and Task-Today labels makes one Task (Task-Today wins)', () => {
  const ctx = makeHubContext({ features: LIVE });
  addThread(ctx, { id: 't1', labels: ['🎯/Task', '🎯/Task-Today'] });
  run(ctx);
  assert.equal(ctx.__hub.tasks.items.length, 1);
  assert.ok(ctx.__hub.tasks.items[0].due);
});

test('(c) crash after Task create but before ledger DONE: retry creates no duplicate (DONE write fails)', () => {
  const ctx = makeHubContext({ features: LIVE });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  ctx.__hub.ledger.failUpsert = (row) => row.Status === 'DONE';
  const r1 = run(ctx);
  assert.equal(r1.counts.errors, 1);
  assert.equal(ctx.__hub.tasks.items.length, 1);
  ctx.__hub.ledger.failUpsert = null;
  ctx.__setNow('2026-10-05T22:06:00Z'); // past the 5 minute retry backoff recorded on the ERROR row
  run(ctx);
  assert.equal(ctx.__hub.tasks.items.length, 1);
  assert.equal(ctx.__hub.ledger.rows.get(keyTask).Status, 'DONE');
});

test('(c) hard crash leaves a stale PENDING row; after the stale window the retry finds the Task by opKey', () => {
  const ctx = makeHubContext({ features: LIVE });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  ctx.__hub.ledger.failUpsert = (row) => row.Status !== 'PENDING';
  run(ctx);
  assert.equal(ctx.__hub.tasks.items.length, 1);
  assert.equal(ctx.__hub.ledger.rows.get(keyTask).Status, 'PENDING');
  ctx.__hub.ledger.failUpsert = null;
  run(ctx);
  assert.equal(ctx.__hub.tasks.items.length, 1, 'in flight: no work yet');
  ctx.__hub.ledger.rows.get(keyTask).UpdatedAt = '2026-10-05T00:00:00.000Z';
  run(ctx);
  assert.equal(ctx.__hub.tasks.items.length, 1, 'retry did not duplicate');
  assert.equal(ctx.__hub.ledger.rows.get(keyTask).Status, 'DONE');
});

test('(d) failed item: sanitized ERROR row, rest of batch processed, retryFailedOperation succeeds later', () => {
  const ctx = makeHubContext({ features: LIVE });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'], subject: 'BOOM' });
  addThread(ctx, { id: 't2', labels: ['🎯/Task'], subject: 'fine' });
  ctx.__hub.tasks.onInsert = (res) => {
    if (/BOOM/.test(res.title)) throw new Error('failed for pat@example.test at https://example.test/secret/path\nstack line');
  };
  const r = run(ctx);
  assert.equal(r.counts.errors, 1);
  assert.equal(r.counts.processed, 1);
  const bad = ctx.__hub.ledger.rows.get(keyTask);
  assert.equal(bad.Status, 'ERROR');
  assert.ok(!/@|https?:|\n/.test(bad.ErrorMessage), bad.ErrorMessage);
  assert.equal(ctx.__hub.ledger.rows.get('GMAIL|t2|TASK').Status, 'DONE');
  ctx.__hub.tasks.onInsert = null;
  const retry = call(ctx, 'retryFailedOperation', keyTask);
  assert.equal(retry.ok, true, retry.message);
  assert.equal(ctx.__hub.ledger.rows.get(keyTask).Status, 'DONE');
  assert.equal(ctx.__hub.tasks.items.length, 2);
  assert.equal(call(ctx, 'retryFailedOperation', keyTask).ok, false, 'DONE rows are not retryable');
});

test('(d) a thread deleted after queueing is quarantined as ERROR and the batch continues', () => {
  const ctx = makeHubContext({ features: LIVE });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  addThread(ctx, { id: 't2', labels: ['🎯/Task'] });
  const realList = ctx.Gmail.Users.Threads.list;
  ctx.Gmail.Users.Threads.list = (u, o) => { const out = realList(u, o); delete ctx.__hub.gmail.threads.t1; return out; };
  const r = run(ctx);
  assert.equal(r.counts.quarantined, 1);
  assert.equal(ctx.__hub.ledger.rows.get(keyTask).Status, 'ERROR');
  assert.equal(ctx.__hub.tasks.items.length, 1);
});

test('(e) DRY_RUN performs zero writes and returns the spec strings', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, NCMMS_CORE_PILOT: true } });
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  addThread(ctx, { id: 't2', labels: ['🎯/Meeting/NCMMS-Core'] });
  const r = run(ctx);
  assert.equal(r.status, 'DRY_RUN');
  assert.ok(r.messages.includes('Would create Task'), r.messages.join('|'));
  assert.ok(r.messages.some((m) => m === 'Would route to NCMMS Core occurrence core_20261006; Would append carry-in to Doc ***'), r.messages.join('|'));
  assert.equal(ctx.__hub.tasks.inserts, 0);
  assert.equal(ctx.__hub.ledger.writes.length, 0);
  assert.equal(ctx.__hub.notes.applyCalls, 0);
  assert.deepEqual(Object.keys(ctx.__hub.notes.docs), []);
  assert.equal(ctx.PropertiesService.getUserProperties().getProperty('HUB_QUEUE_CURSOR'), null);
});

test('(e) DRY_RUN spec strings: skip-if-processed and defer-after-cutoff', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, NCMMS_CORE_PILOT: true }, now: '2026-10-06T14:45:00Z' });
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  ctx.__hub.ledger.rows.set(keyTask, { OperationKey: keyTask, SourceType: 'GMAIL', SourceId: 't1', Status: 'DONE', UpdatedAt: '2026-10-05T00:00:00.000Z' });
  const skip = call(ctx, 'routeThreadToTask', 't1', {});
  assert.equal(skip.message, 'Would skip because already processed');
  const defer = call(ctx, 'routeThreadToMeeting', 't1', null, { seriesKey: 'NCMMS_CORE' });
  assert.ok(defer.messages.includes('Would defer because cutoff passed'), defer.message);
  assert.ok(defer.message.includes('core_20261013'));
  assert.equal(ctx.__hub.tasks.inserts, 0);
  assert.equal(ctx.__hub.ledger.writes.length, 0);
});

test('(f) all flags OFF: processWorkflowQueue touches nothing', () => {
  const ctx = makeHubContext();
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  const r = run(ctx);
  assert.equal(r.status, 'NOOP');
  assert.deepEqual(ctx.__hub.gmail.calls, []);
  assert.deepEqual(ctx.__hub.calendar.calls, []);
  assert.deepEqual(ctx.__hub.tasks.calls, []);
  assert.equal(ctx.__hub.ledger.writes.length, 0);
  assert.equal(ctx.__hub.tasks.inserts, 0);
  assert.equal(toHost(ctx._hubDispatchInternal()).status, 'NOOP');
});

test('(g) two concurrent runs: the second finds the lock held and does nothing', () => {
  const ctx = makeHubContext({ features: LIVE });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  let second = null;
  ctx.__hub.tasks.onInsert = () => { second = run(ctx); };
  const first = run(ctx);
  assert.equal(first.ok, true);
  assert.equal(second.status, 'LOCK_BUSY');
  assert.equal(ctx.__hub.tasks.items.length, 1);
});

const coreOpts = { features: { GMAIL_ROUTER: true, NCMMS_CORE_PILOT: true, DRY_RUN: false } };
const coreCount = (ctx) => {
  const doc = ctx.__hub.notes.docs['doc-NCMMS_CORE-0000000000'];
  return doc ? toHost(ctx.DPEngines.carryInCount(doc, { date: '2026-10-06', displayName: 'NCMMS Core Team' })) : 0;
};

test('(h) Monday-afternoon Core route targets the Tuesday occurrence; rerun does not duplicate', () => {
  const ctx = makeHubContext({ ...coreOpts, now: '2026-10-05T22:00:00Z' });
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 't1', labels: ['🎯/Meeting/NCMMS-Core'], subject: 'Budget question' });
  run(ctx);
  const key = 'GMAIL|t1|MEETING|core_20261006';
  assert.equal(ctx.__hub.ledger.rows.get(key).Status, 'DONE');
  assert.equal(coreCount(ctx), 1);
  run(ctx);
  assert.equal(ctx.__hub.notes.applyCalls, 1);
  assert.equal(coreCount(ctx), 1);
  ctx.__setNow('2026-10-12T22:00:00Z');
  run(ctx);
  assert.equal([...ctx.__hub.ledger.rows.keys()].filter((k) => k.includes('MEETING')).length, 1, 'never re-routed to a later occurrence');
});

test('(h) Tuesday 07:20 PT routes to the same day; 07:45 PT (after the 07:30 prep cutoff) routes to next week', () => {
  const early = makeHubContext({ ...coreOpts, now: '2026-10-06T14:20:00Z' });
  addCoreOccurrences(early);
  addThread(early, { id: 't1', labels: ['🎯/Meeting/NCMMS-Core'] });
  run(early);
  assert.ok(early.__hub.ledger.rows.has('GMAIL|t1|MEETING|core_20261006'));
  const late = makeHubContext({ ...coreOpts, now: '2026-10-06T14:45:00Z' });
  addCoreOccurrences(late);
  addThread(late, { id: 't1', labels: ['🎯/Meeting/NCMMS-Core'] });
  run(late);
  assert.ok(late.__hub.ledger.rows.has('GMAIL|t1|MEETING|core_20261013'));
  assert.ok(!late.__hub.ledger.rows.has('GMAIL|t1|MEETING|core_20261006'));
});

test('(h) user override routes to the current occurrence after the cutoff, or to a specific one', () => {
  const ctx = makeHubContext({ ...coreOpts, now: '2026-10-06T14:45:00Z' });
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 't1', labels: [] });
  addThread(ctx, { id: 't2', labels: [] });
  const cur = call(ctx, 'routeThreadToMeeting', 't1', null, { seriesKey: 'NCMMS_CORE', mode: 'current' });
  assert.equal(cur.ok, true, cur.message);
  assert.ok(ctx.__hub.ledger.rows.has('GMAIL|t1|MEETING|core_20261006'));
  const spec = call(ctx, 'routeThreadToMeeting', 't2', 'core_20261013', { seriesKey: 'NCMMS_CORE' });
  assert.equal(spec.ok, true, spec.message);
  assert.ok(ctx.__hub.ledger.rows.has('GMAIL|t2|MEETING|core_20261013'));
  assert.match(spec.targetUrl, /docs\.google\.com\/document\/d\/doc-NCMMS_CORE/);
});

test('(h) backlog routing is ledger-only and takes the series key in the occurrence slot', () => {
  const ctx = makeHubContext({ ...coreOpts });
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 't1', labels: [] });
  const r = call(ctx, 'routeThreadToMeeting', 't1', 'NCMMS_CORE', { backlog: true, framing: 'later' });
  assert.equal(r.ok, true, r.message);
  assert.equal(ctx.__hub.ledger.rows.get('GMAIL|t1|MEETING|BACKLOG-NCMMS_CORE').TargetType, 'BACKLOG');
  assert.equal(ctx.__hub.notes.applyCalls, 0);
});

test('(h) a doc write that is inaccessible quarantines as ERROR and retry succeeds once fixed', () => {
  const ctx = makeHubContext({ ...coreOpts, now: '2026-10-05T22:00:00Z' });
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 't1', labels: ['🎯/Meeting/NCMMS-Core'] });
  ctx.__hub.notes.inaccessible = true;
  run(ctx);
  const key = 'GMAIL|t1|MEETING|core_20261006';
  assert.equal(ctx.__hub.ledger.rows.get(key).Status, 'ERROR');
  ctx.__hub.notes.inaccessible = false;
  const retry = call(ctx, 'retryFailedOperation', key);
  assert.equal(retry.ok, true, retry.message);
  assert.equal(coreCount(ctx), 1);
});

// 2026-10-09 fail-open review #7: a MEETING retry whose MetadataJson is corrupt used to default the
// series to NCMMS_CORE and route there. It must fail explicitly instead of guessing a destination.
test('(h2) retry of a MEETING op with corrupt MetadataJson fails explicitly and writes nothing', () => {
  const ctx = makeHubContext({ ...coreOpts, now: '2026-10-05T22:00:00Z' });
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 't1', labels: ['🎯/Meeting/NCMMS-Core'] });
  ctx.__hub.notes.inaccessible = true;
  run(ctx);
  const key = 'GMAIL|t1|MEETING|core_20261006';
  assert.equal(ctx.__hub.ledger.rows.get(key).Status, 'ERROR');
  ctx.__hub.ledger.rows.get(key).MetadataJson = '{"seriesKey":"NCMMS_';
  ctx.__hub.notes.inaccessible = false;
  const retry = call(ctx, 'retryFailedOperation', key);
  assert.equal(retry.ok, false, 'must not guess the series');
  assert.equal(retry.errorCode, 'CORRUPT_METADATA');
  assert.equal(coreCount(ctx), 0, 'nothing routed');
  assert.equal(ctx.__hub.ledger.rows.get(key).Status, 'ERROR');
  assert.match(ctx.__consoleLines.join('\n'), /corrupt MetadataJson[\s\S]*\n\s+at /);
});

test('(i) Task-derived (gasTaskId) Calendar events are never destinations nor importable', () => {
  const ctx = makeHubContext({ ...coreOpts, now: '2026-10-05T22:00:00Z' });
  addCoreOccurrences(ctx);
  ctx.__hub.calendar.events.push({ id: 'tk1', summary: '🛠 NCMMS Core Team Meeting', start: '2026-10-06T14:00:00Z', end: '2026-10-06T14:30:00Z', extendedProperties: { shared: { gasTaskId: 'abc' } } });
  const series = ctx.__hub.config.registry.find((r) => r.SeriesKey === 'NCMMS_CORE');
  const occs = toHost(ctx.DPCalendarRepo.listOccurrences(series, ctx.__hub.config.registry, new ctx.Date()));
  assert.deepEqual(occs.map((o) => o.id).sort(), ['core_20261006', 'core_20261013']);
  const c = toHost(ctx.DPEngines.classifyEventDetailed({ id: 'tk1', summary: 'x', extendedProperties: { shared: { gasTaskId: 'abc' } } }));
  assert.equal(c.importable, false);
  const loaded = toHost(ctx.DPCalendarRepo.loadEvents('primary', new ctx.Date(0), new ctx.Date('2027-01-01T00:00:00Z'), ctx.__hub.config.registry));
  assert.equal(loaded.find((e) => e.id === 'tk1').importable, false);
  assert.throws(() => ctx.DPCalendarRepo.getOccurrence(series, 'tk1', ctx.__hub.config.registry), /not a meeting destination/);
  addThread(ctx, { id: 't1', labels: [] });
  const r = call(ctx, 'routeThreadToMeeting', 't1', 'tk1', { seriesKey: 'NCMMS_CORE' });
  assert.equal(r.ok, false);
});

test('waiting items are Tasks tagged [Waiting] with person and nag date', () => {
  const ctx = makeHubContext({ features: LIVE });
  addThread(ctx, { id: 't1', labels: ['🎯/Waiting'], from: 'Dana Roe <dana@example.test>' });
  run(ctx);
  const t = ctx.__hub.tasks.items[0];
  assert.match(t.notes, /\[Waiting\]/);
  const meta = ctx.DPEngines.taskPlannerReadMeta(t.notes);
  assert.equal(meta.waitingOn, 'Dana Roe');
  assert.equal(meta.nagDate, '2026-10-12');
  assert.equal(t.due, '2026-10-12T00:00:00.000Z');
});
