/**
 * @file hubSeriesKey.test.js
 * @description 2026-10-09 review #8: a MEETING ledger row must never have its destination series
 * guessed. retryFailedOperation fails MISSING_SERIES (writing nothing) when the series is not
 * unambiguously recorded; findActiveMeetingRow treats corrupt or series-less metadata as unusable;
 * every writer of a MEETING row records seriesKey.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findActiveMeetingRow, beginOp } from '../src/integration/ledger.js';
import { planBatch } from '../src/integration/queuePlanner.js';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread, addCoreOccurrences } from './helpers/gasFakesHub.js';

const NOW = new Date('2026-10-06T12:00:00Z');
const recent = '2026-10-06T11:00:00.000Z';

function meetingRow(opKey, MetadataJson, Status = 'PENDING') {
  const row = beginOp({ opKey, sourceType: 'GMAIL', sourceId: 't1', action: 'ROUTE_MEETING', targetType: 'DOC' }, recent);
  return { ...row, Status, MetadataJson };
}

test('findActiveMeetingRow: a row with corrupt MetadataJson is unusable (never a match for any series) and is logged', (t) => {
  const logged = [];
  t.mock.method(console, 'error', (...a) => logged.push(a.join(' ')));
  const corrupt = meetingRow('GMAIL|t1|MEETING|occA', '{"seriesKey":"NCMMS_');
  assert.equal(findActiveMeetingRow([corrupt], { threadId: 't1', seriesKey: 'NCMMS_CORE', now: NOW }), null);
  assert.match(logged.join('\n'), /findActiveMeetingRow[\s\S]*corrupt[\s\S]*\n\s+at /);
  const notObject = meetingRow('GMAIL|t1|MEETING|occA', '[1,2]');
  assert.equal(findActiveMeetingRow([notObject], { threadId: 't1', seriesKey: 'NCMMS_CORE', now: NOW }), null);
});

test('findActiveMeetingRow: valid metadata without seriesKey is unusable unless the op key encodes the series', (t) => {
  const logged = [];
  t.mock.method(console, 'error', (...a) => logged.push(a.join(' ')));
  const bare = meetingRow('GMAIL|t1|MEETING|occA', '{"attempts":1}');
  assert.equal(findActiveMeetingRow([bare], { threadId: 't1', seriesKey: 'NCMMS_CORE', now: NOW }), null);
  assert.match(logged.join('\n'), /findActiveMeetingRow[\s\S]*no seriesKey/);
  const backlog = meetingRow('GMAIL|t1|MEETING|BACKLOG-NCMMS_CORE', '');
  assert.equal(findActiveMeetingRow([backlog], { threadId: 't1', seriesKey: 'NCMMS_CORE', now: NOW }).OperationKey, backlog.OperationKey);
  assert.equal(findActiveMeetingRow([backlog], { threadId: 't1', seriesKey: 'OTHER', now: NOW }), null);
  const good = meetingRow('GMAIL|t1|MEETING|occB', '{"seriesKey":"NCMMS_CORE"}');
  assert.equal(findActiveMeetingRow([bare, good], { threadId: 't1', seriesKey: 'NCMMS_CORE', now: NOW }).OperationKey, good.OperationKey);
});

test('planBatch: a quarantined MEETING item records its seriesKey (fresh and re-quarantined)', () => {
  const item = { opKey: 'GMAIL|t1|MEETING|occA', threadId: 't1', kind: 'MEETING', action: 'ROUTE_MEETING', seriesKey: 'NCMMS_CORE' };
  const base = { items: [item], cursor: 0, batchSize: 5, lockHeld: true, flags: { GMAIL_ROUTER: true }, clock: () => NOW, isSourceAvailable: () => false };
  const fresh = planBatch(base);
  assert.equal(JSON.parse(fresh.quarantined[0].ledgerRow.MetadataJson).seriesKey, 'NCMMS_CORE');
  const prior = meetingRow(item.opKey, '{"attempts":2}', 'ERROR');
  const again = planBatch({ ...base, priorRow: () => prior });
  const meta = JSON.parse(again.quarantined[0].ledgerRow.MetadataJson);
  assert.equal(meta.seriesKey, 'NCMMS_CORE');
  assert.equal(meta.attempts, 3);
});

const coreOpts = { features: { GMAIL_ROUTER: true, NCMMS_CORE_PILOT: true, DRY_RUN: false }, now: '2026-10-05T22:00:00Z' };
const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const coreCount = (ctx) => Object.values(ctx.__hub.notes.docs).reduce((n, d) => n + d.paragraphs.filter((p) => /t1/.test(JSON.stringify(p))).length, 0);

function erroredMeeting(ctx, key, MetadataJson) {
  ctx.__hub.ledger.rows.set(key, { ...meetingRow(key, MetadataJson, 'ERROR'), ErrorCode: 'SOURCE_CHECK_FAILED', ErrorMessage: 'x' });
  return { ...ctx.__hub.ledger.rows.get(key) };
}

test('retryFailedOperation: MEETING row with valid metadata but no seriesKey fails MISSING_SERIES and writes nothing', () => {
  const ctx = makeHubContext(coreOpts);
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 't1', labels: [] });
  const key = 'GMAIL|t1|MEETING|core_20261006';
  const before = erroredMeeting(ctx, key, '{"attempts":1,"retryable":true}');
  const writesBefore = ctx.__hub.ledger.writes.length;
  const retry = call(ctx, 'retryFailedOperation', key);
  assert.equal(retry.ok, false, 'must not default the series');
  assert.equal(retry.errorCode, 'MISSING_SERIES');
  assert.equal(ctx.__hub.ledger.writes.length, writesBefore, 'no ledger write');
  assert.deepEqual(ctx.__hub.ledger.rows.get(key), before, 'row untouched');
  assert.equal(coreCount(ctx), 0, 'nothing routed');
  assert.equal(ctx.__hub.notes.applyCalls, 0);
});

test('retryFailedOperation: an invalid seriesKey in metadata is not usable either (MISSING_SERIES)', () => {
  const ctx = makeHubContext(coreOpts);
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 't1', labels: [] });
  const key = 'GMAIL|t1|MEETING|core_20261006';
  erroredMeeting(ctx, key, '{"seriesKey":"ncmms core!"}');
  const retry = call(ctx, 'retryFailedOperation', key);
  assert.equal(retry.errorCode, 'MISSING_SERIES');
  assert.equal(ctx.__hub.notes.applyCalls, 0);
});

test('retryFailedOperation: backlog op key series conflicting with metadata seriesKey fails, writes nothing', () => {
  const ctx = makeHubContext(coreOpts);
  addThread(ctx, { id: 't1', labels: [] });
  const key = 'GMAIL|t1|MEETING|BACKLOG-NCMMS_CORE';
  erroredMeeting(ctx, key, '{"seriesKey":"OTHER_SERIES"}');
  const writesBefore = ctx.__hub.ledger.writes.length;
  const retry = call(ctx, 'retryFailedOperation', key);
  assert.equal(retry.ok, false);
  assert.equal(retry.errorCode, 'SERIES_CONFLICT');
  assert.equal(ctx.__hub.ledger.writes.length, writesBefore);
});

test('retryFailedOperation: backlog op key without metadata seriesKey derives the series from the key', () => {
  const ctx = makeHubContext(coreOpts);
  addThread(ctx, { id: 't1', labels: [] });
  const key = 'GMAIL|t1|MEETING|BACKLOG-NCMMS_CORE';
  erroredMeeting(ctx, key, '{"attempts":1}');
  const retry = call(ctx, 'retryFailedOperation', key);
  assert.equal(retry.ok, true, retry.message);
  assert.equal(ctx.__hub.ledger.rows.get(key).Status, 'DONE');
});

test('executeRoute: a MEETING failure before the claim records seriesKey on the new ERROR row', () => {
  const ctx = makeHubContext(coreOpts);
  addThread(ctx, { id: 't1', labels: [] });
  const key = 'GMAIL|t1|MEETING|occ_x';
  const out = ctx.DPQueue.withLock(1000, () => ctx.DPQueue.executeRoute({ kind: 'MEETING', threadId: 't1', seriesKey: 'NOT_CONFIGURED', occurrenceId: 'occ_x', opKey: key, dryRun: false, settings: ctx.DPQueue.getSettings() }));
  assert.equal(toHost(out).value.ok, false);
  const row = ctx.__hub.ledger.rows.get(key);
  assert.equal(row.Status, 'ERROR');
  assert.equal(row.ErrorCode, 'SERIES_NOT_FOUND');
  assert.equal(JSON.parse(row.MetadataJson).seriesKey, 'NOT_CONFIGURED');
});
