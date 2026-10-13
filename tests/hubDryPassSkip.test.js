/**
 * @file hubDryPassSkip.test.js
 * @description Trial mode (DRY_RUN) writes no DONE rows, so every scheduled tick used to re-read Gmail metadata for
 * the whole batch. A scheduled dry tick whose 🎯/ listings, flags, settings and registry are unchanged since the last
 * full dry pass must skip the per-thread reads; manual runs and any change still do a full pass.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread } from './helpers/gasFakesHub.js';

const DRY = { GMAIL_ROUTER: true, DRY_RUN: true };
const TICK = '2026-10-06T16:00:00Z'; // 09:00 PT: no daily job due, so the tick is just the queue pass
const gets = (ctx) => ctx.__hub.gmail.calls.filter((c) => c.startsWith('threads.get')).length;
const tick = (ctx) => toHost(ctx._hubDispatchInternal());
const userProps = (ctx) => ctx.PropertiesService.getUserProperties();
const lastDry = (ctx) => JSON.parse(userProps(ctx).getProperty('HUB_LAST_RUN_DRY'));

function seeded() {
  const ctx = makeHubContext({ features: DRY, now: TICK });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  addThread(ctx, { id: 't2', labels: ['🎯/Waiting'], archived: true });
  return ctx;
}

test('a second scheduled dry tick with nothing changed makes no threads.get call', () => {
  const ctx = seeded();
  tick(ctx);
  const first = gets(ctx);
  assert.ok(first >= 2, `first tick reads both threads, archived one included (${first})`);
  const firstCounts = lastDry(ctx).counts;
  ctx.__setNow('2026-10-06T16:05:00Z');
  tick(ctx);
  assert.equal(gets(ctx), first, 'unchanged tick must not re-read thread metadata');
  const after = lastDry(ctx);
  assert.equal(after.at, '2026-10-06T16:05:00.000Z', 'last-run time still moves so the status is not stale');
  assert.deepEqual(after.counts, firstCounts, 'the skipped tick reports the unchanged result');
  assert.equal(after.unchangedSince, '2026-10-06T16:00:00.000Z');
});

test('a thread change (new historyId) forces a full dry pass', () => {
  const ctx = seeded();
  tick(ctx);
  const first = gets(ctx);
  ctx.__hub.gmail.threads.t1.historyId = 200;
  ctx.__setNow('2026-10-06T16:05:00Z');
  tick(ctx);
  assert.ok(gets(ctx) > first);
});

test('the skip expires after the max age', () => {
  const ctx = seeded();
  tick(ctx);
  const first = gets(ctx);
  ctx.__setNow('2026-10-06T17:00:00Z');
  tick(ctx);
  assert.ok(gets(ctx) > first, 'an hour later the dry pass runs in full');
});

test('a manual run always does a full dry pass', () => {
  const ctx = seeded();
  tick(ctx);
  const first = gets(ctx);
  toHost(ctx._processWorkflowQueueInternal());
  assert.ok(gets(ctx) > first);
});

test('live mode never records a dry-pass fingerprint', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, DRY_RUN: false }, now: TICK });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  tick(ctx);
  assert.equal(userProps(ctx).getProperty('HUB_DRY_PASS_FP'), null);
});
