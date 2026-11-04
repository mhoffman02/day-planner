/**
 * @file hubLabelWatermark.test.js
 * @description The Gmail queue picks up only threads that gained a 🎯/ label since the last clean scan (Gmail
 * History API watermark, so archived threads count), and falls back to a bounded LookbackDays window on the first
 * run or when Gmail history has expired. The watermark advances only after a clean, complete live run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread } from './helpers/gasFakesHub.js';

const LIVE = { GMAIL_ROUTER: true, DRY_RUN: false };
const TICK = '2026-10-06T16:00:00Z';
const WM = 'HUB_HISTORY_WM';
const tick = (ctx) => toHost(ctx._hubDispatchInternal());
const props = (ctx) => ctx.PropertiesService.getUserProperties();
const calls = (ctx, prefix) => ctx.__hub.gmail.calls.filter((c) => c.startsWith(prefix));

function seeded() {
  const ctx = makeHubContext({ features: LIVE, now: TICK });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'], archived: true });
  ctx.__hub.gmail.mailboxHistoryId = 100;
  return ctx;
}

test('first run (no watermark) lists by label with a newer_than window and stores the watermark', () => {
  const ctx = seeded();
  tick(ctx);
  assert.equal(calls(ctx, 'history.list').length, 0, 'no watermark yet: History API untouched');
  assert.equal(props(ctx).getProperty(WM), '100');
});

test('with a watermark only threads labelled since then are collected, archived ones included', () => {
  const ctx = seeded();
  props(ctx).setProperty(WM, '100');
  ctx.__hub.gmail.mailboxHistoryId = 150;
  const labelId = ctx.__hub.gmail.labelId('🎯/Task');
  ctx.__hub.gmail.historyEvents = [{ labelsAdded: [{ message: { id: 'm1', threadId: 't1' }, labelIds: [labelId] }] }];
  tick(ctx);
  assert.ok(calls(ctx, 'history.list:100').length >= 1);
  assert.equal(calls(ctx, 'threads.list').length, 0, 'label listing is skipped while the watermark is valid');
  assert.equal(props(ctx).getProperty(WM), '150', 'clean full run advances the watermark');
});

test('expired history (404) falls back to the lookback listing', () => {
  const ctx = seeded();
  props(ctx).setProperty(WM, '1');
  ctx.__hub.gmail.mailboxHistoryId = 200;
  ctx.__hub.gmail.historyExpired = true;
  tick(ctx);
  assert.ok(calls(ctx, 'threads.list').length >= 1, 'fell back to listing by label');
  assert.equal(props(ctx).getProperty(WM), '200');
});

test('a dry run never advances the watermark', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, DRY_RUN: true }, now: TICK });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  ctx.__hub.gmail.mailboxHistoryId = 100;
  tick(ctx);
  assert.equal(props(ctx).getProperty(WM), null);
});

test('the lookback window defaults to 30 days', () => {
  const ctx = seeded();
  tick(ctx);
  assert.ok(ctx.__hub.gmail.listQueries.includes('newer_than:30d'));
});


test('a backoff-blocked ERROR is retried after the backoff even though the watermark moved past it', () => {
  const ctx = seeded();
  props(ctx).setProperty(WM, '100');
  ctx.__hub.gmail.mailboxHistoryId = 150;
  ctx.__hub.gmail.historyEvents = [];
  ctx.__hub.ledger.rows.set('GMAIL|t1|TASK', { OperationKey: 'GMAIL|t1|TASK', SourceType: 'GMAIL', SourceId: 't1', Status: 'ERROR', ErrorCode: 'TRANSIENT',
    MetadataJson: JSON.stringify({ attempts: 1, nextRetryAt: '2026-10-06T17:00:00.000Z' }), UpdatedAt: '2026-10-06T15:00:00.000Z' });
  tick(ctx); // inside backoff: nothing runs, run is clean, watermark advances
  assert.equal(props(ctx).getProperty(WM), '150');
  assert.equal(ctx.__hub.ledger.rows.get('GMAIL|t1|TASK').Status, 'ERROR');
  ctx.__setNow('2026-10-06T17:30:00Z'); // backoff elapsed, no new label event for t1
  ctx.__hub.gmail.mailboxHistoryId = 160;
  tick(ctx);
  assert.equal(ctx.__hub.ledger.rows.get('GMAIL|t1|TASK').Status, 'DONE', 'retried from the ledger, not from a label event');
});

test('a plain Task label is skipped when a Decision for the thread already finished (not in the watermark window)', () => {
  const ctx = seeded();
  props(ctx).setProperty(WM, '100');
  ctx.__hub.gmail.mailboxHistoryId = 150;
  const labelId = ctx.__hub.gmail.labelId('🎯/Task');
  ctx.__hub.gmail.historyEvents = [{ labelsAdded: [{ message: { id: 'm1', threadId: 't1' }, labelIds: [labelId] }] }];
  ctx.__hub.ledger.rows.set('GMAIL|t1|DECISION', { OperationKey: 'GMAIL|t1|DECISION', SourceType: 'GMAIL', SourceId: 't1', Status: 'DONE', UpdatedAt: '2026-10-01T00:00:00.000Z' });
  tick(ctx);
  assert.equal(ctx.__hub.ledger.rows.has('GMAIL|t1|TASK'), false, 'no second task for a decided thread');
});
