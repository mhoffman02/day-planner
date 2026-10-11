/**
 * @file hubSheetsMeter.test.js
 * @description Phase 29 step 0: a queue run reports its Sheets reads/writes in counts.sheetsReads /
 * counts.sheetsWrites, metered on DPConfig and reset at the top of every run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread } from './helpers/gasFakesHub.js';

const LIVE = { GMAIL_ROUTER: true, DRY_RUN: false };
const run = (ctx) => toHost(ctx._processWorkflowQueueInternal());
const READS = new Set(['spreadsheets.get', 'values.get', 'values.batchGet']);
const WRITES = new Set(['spreadsheets.batchUpdate', 'values.update', 'values.batchUpdate', 'values.append']);

function bucket(calls) {
  const out = { reads: 0, writes: 0 };
  calls.forEach((c) => {
    if (READS.has(c.method)) out.reads += 1;
    else if (WRITES.has(c.method)) out.writes += 1;
    else throw new Error(`unbucketed Sheets call ${c.method}`);
  });
  return out;
}

test('realStores run: counts.sheetsReads/sheetsWrites equal the Sheets calls the run made', () => {
  const ctx = makeHubContext({ realStores: true, features: LIVE, batchSize: 25 });
  for (let i = 0; i < 5; i += 1) addThread(ctx, { id: `t${i}`, labels: ['🎯/Task'], subject: `Subject ${i}` });
  ctx.__fakes.sheetsCalls.length = 0;
  const r = run(ctx);
  assert.equal(r.ok, true, JSON.stringify(r));
  const want = bucket(ctx.__fakes.sheetsCalls);
  assert.ok(want.reads > 0 && want.writes > 0, `fake saw no traffic: ${JSON.stringify(want)}`);
  assert.equal(r.counts.sheetsReads, want.reads);
  assert.equal(r.counts.sheetsWrites, want.writes);
});

test('meter resets at the top of every run', () => {
  const ctx = makeHubContext({ realStores: true, features: LIVE, batchSize: 25 });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  run(ctx);
  ctx.__fakes.sheetsCalls.length = 0;
  const r2 = run(ctx);
  const want = bucket(ctx.__fakes.sheetsCalls);
  assert.equal(r2.counts.sheetsReads, want.reads);
  assert.equal(r2.counts.sheetsWrites, want.writes);
});

test('non-realStores DPConfig fake reports zero Sheets traffic', () => {
  const ctx = makeHubContext({ features: LIVE });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  const r = run(ctx);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.counts.sheetsReads, 0);
  assert.equal(r.counts.sheetsWrites, 0);
});
