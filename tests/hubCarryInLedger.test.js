/**
 * @file hubCarryInLedger.test.js
 * @description 2026-11-02 (WORK test T14): drive.file refuses writes to the user's own notes Doc, so a
 * Meeting Prep carry-in is an Integration Ledger row (TargetType CARRY_IN) shown on the Meeting Prep
 * page. No Google Doc is read or written on the route path or on the page load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread, addCoreOccurrences } from './helpers/gasFakesHub.js';

const coreOpts = { features: { GMAIL_ROUTER: true, NCMMS_CORE_PILOT: true, DRY_RUN: false } };
const run = (ctx) => toHost(ctx._processWorkflowQueueInternal());
const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const KEY = 'GMAIL|t1|MEETING|core_20261006';

function routed(threadOpts = {}, ctxOpts = {}) {
  const ctx = makeHubContext({ ...coreOpts, now: '2026-10-05T22:00:00Z', ...ctxOpts });
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 't1', labels: ['🎯/Meeting/NCMMS-Core'], subject: 'Budget question', snippet: 'Please decide &amp; reply by Friday', ...threadOpts });
  run(ctx);
  return ctx;
}

test('Core route stores a CARRY_IN ledger row with the display fields and never touches a Doc', () => {
  const ctx = routed();
  const row = ctx.__hub.ledger.rows.get(KEY);
  assert.equal(row.Status, 'DONE');
  assert.equal(row.TargetType, 'CARRY_IN');
  assert.equal(row.TargetId, 'core_20261006');
  const m = JSON.parse(row.MetadataJson);
  assert.equal(m.seriesKey, 'NCMMS_CORE');
  assert.equal(m.occurrenceId, 'core_20261006');
  assert.ok(m.start, 'start is re-included because completeOp replaces the metadata');
  assert.equal(m.subject, 'Budget question');
  assert.equal(m.fromName, 'Pat Example');
  assert.equal(m.receivedDate, '2026-10-05');
  assert.match(m.gmailUrl, /mail\.google\.com.*t1/);
  assert.equal(m.snippet, 'Please decide & reply by Friday');
  assert.ok(m.kind);
  assert.equal(ctx.__hub.notes.applyCalls, 0);
  assert.deepEqual(Object.keys(ctx.__hub.notes.docs), []);
});

test('Core route succeeds even when the notes Doc is inaccessible (no Doc call is made)', () => {
  const ctx = makeHubContext({ ...coreOpts, now: '2026-10-05T22:00:00Z' });
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 't1', labels: ['🎯/Meeting/NCMMS-Core'] });
  ctx.__hub.notes.inaccessible = true;
  run(ctx);
  assert.equal(ctx.__hub.ledger.rows.get(KEY).Status, 'DONE');
});

test('snippet is capped at maxExcerpt', () => {
  const ctx = routed({ snippet: 'x'.repeat(500) });
  const m = JSON.parse(ctx.__hub.ledger.rows.get(KEY).MetadataJson);
  assert.ok(m.snippet.length > 0 && m.snippet.length <= 160, String(m.snippet.length));
});

test('DRY_RUN message for a meeting route no longer names a Doc', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, NCMMS_CORE_PILOT: true } });
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 't2', labels: ['🎯/Meeting/NCMMS-Core'] });
  const r = run(ctx);
  assert.ok(r.messages.some((m) => m === 'Would route to NCMMS Core occurrence core_20261006; Would record carry-in on the Meeting Prep page'), r.messages.join('|'));
});

test('getMeetingPrep lists this occurrence carry-ins from the ledger, sorted, with no Gmail or Docs call', () => {
  const ctx = routed();
  const other = { ...ctx.__hub.ledger.rows.get(KEY), OperationKey: 'GMAIL|t9|MEETING|core_20261013' };
  other.MetadataJson = JSON.stringify({ ...JSON.parse(other.MetadataJson), occurrenceId: 'core_20261013', subject: 'Other week' });
  ctx.__hub.ledger.rows.set(other.OperationKey, other);
  const second = { ...ctx.__hub.ledger.rows.get(KEY), OperationKey: 'GMAIL|t3|MEETING|core_20261006' };
  second.MetadataJson = JSON.stringify({ ...JSON.parse(second.MetadataJson), subject: 'Aardvark' });
  ctx.__hub.ledger.rows.set(second.OperationKey, second);
  const calls = ctx.__hub.gmail.calls.length;
  const prep = call(ctx, 'getMeetingPrep', 'NCMMS_CORE', null);
  assert.equal(prep.ok, true, prep.message);
  assert.equal(prep.carryInCount, 2);
  assert.deepEqual(prep.carryIns.map((c) => c.subject), ['Aardvark', 'Budget question']);
  assert.deepEqual(Object.keys(prep.carryIns[1]).sort(), ['framing', 'fromName', 'gmailUrl', 'kind', 'receivedDate', 'snippet', 'subject']);
  assert.equal(prep.warning, null);
  assert.equal(prep.carryInsText.split('\n').length, 2);
  assert.match(prep.carryInsText, /^• Aardvark: .*\[Email, Pat Example, 2026-10-05, .+\] https:\/\/mail\.google\.com.*t1$/m);
  assert.equal(ctx.__hub.gmail.calls.length, calls, 'no Gmail call on page load');
  assert.equal(ctx.__hub.notes.applyCalls, 0);
});

test('getMeetingPrep with no carry-ins returns an empty list and a zero count, never null', () => {
  const ctx = makeHubContext({ ...coreOpts, now: '2026-10-05T22:00:00Z' });
  addCoreOccurrences(ctx);
  const prep = call(ctx, 'getMeetingPrep', 'NCMMS_CORE', null);
  assert.equal(prep.carryInCount, 0);
  assert.deepEqual(prep.carryIns, []);
});

test('a CARRY_IN row with corrupt MetadataJson is logged loudly and skipped, not swallowed', () => {
  const ctx = routed();
  ctx.__hub.ledger.rows.get(KEY).MetadataJson = '{"seriesKey":"NCMMS_';
  const prep = call(ctx, 'getMeetingPrep', 'NCMMS_CORE', null);
  assert.equal(prep.ok, true);
  assert.equal(prep.carryInCount, 0);
  assert.match(ctx.__consoleLines.join('\n'), /corrupt MetadataJson[\s\S]*\n\s+at /);
});

test('getHubSheetLink supplies regrantUrl built from the running deployment URL', () => {
  const ctx = makeHubContext({ realStores: true });
  ctx.__hub.webAppUrl = 'https://script.google.com/macros/s/WORKID/exec';
  assert.equal(call(ctx, 'getHubSheetLink').regrantUrl, 'https://script.google.com/macros/s/WORKID/exec?view=regrant');
  ctx.__hub.webAppUrl = 'https://script.google.com/a/macros/gsa.gov/s/X/exec?authuser=1';
  assert.equal(call(ctx, 'getHubSheetLink').regrantUrl, 'https://script.google.com/a/macros/gsa.gov/s/X/exec?authuser=1&view=regrant');
});
