/**
 * @file hubSnapshot.test.js
 * @description Phase 29: one Values.batchGet snapshot per locked queue run (Config + Registry +
 * Ledger). Config/registry reads during the run come from it; writes made mid-run are patched into
 * it so later reads never see stale values; it is dropped when the run ends.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread } from './helpers/gasFakesHub.js';

const LIVE = { GMAIL_ROUTER: true, DRY_RUN: false };
const run = (ctx) => toHost(ctx._processWorkflowQueueInternal());
const reads = (ctx) => ctx.__fakes.sheetsCalls.filter((c) => ['spreadsheets.get', 'values.get', 'values.batchGet'].includes(c.method));

function liveCtx() {
  const ctx = makeHubContext({ realStores: true, features: LIVE, batchSize: 25 });
  ctx.__fakes.sheetsCalls.length = 0;
  return ctx;
}

test('3-item run makes exactly one Sheets read: a batchGet of Config, Registry and Ledger', () => {
  const ctx = makeHubContext({ realStores: true, features: LIVE, batchSize: 25 });
  for (let i = 0; i < 3; i += 1) addThread(ctx, { id: `t${i}`, labels: ['🎯/Task'], subject: `Subject ${i}` });
  ctx.__fakes.sheetsCalls.length = 0;
  const r = run(ctx);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.counts.processed, 3, JSON.stringify(r.counts));
  const got = reads(ctx);
  assert.deepEqual(got.map((c) => c.method), ['values.batchGet'], JSON.stringify(got));
  assert.equal(got[0].ranges.length, 3);
  assert.equal(r.counts.sheetsReads, 1);
});

test('empty run makes exactly one Sheets read', () => {
  const ctx = liveCtx();
  const r = run(ctx);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(reads(ctx).length, 1);
});

test('snapshot serves getConfig/getRegistry/getFeatures({fresh}) with no Sheets call, until endSnapshot', () => {
  const ctx = liveCtx();
  ctx.DPConfig.beginSnapshot([]);
  assert.equal(reads(ctx).length, 1);
  ctx.DPConfig.getConfig();
  ctx.DPConfig.getRegistry();
  ctx.DPConfig.getFeatures({ fresh: true });
  assert.equal(reads(ctx).length, 1);
  ctx.DPConfig.endSnapshot();
  ctx.DPConfig.getRegistry();
  assert.equal(reads(ctx).length, 2);
});

test('beginSnapshot returns the extra ranges in order', () => {
  const ctx = liveCtx();
  const extra = toHost(ctx.DPConfig.beginSnapshot(["'Config'!A1:A1", "'Meeting Registry'!A1:A1"]));
  ctx.DPConfig.endSnapshot();
  assert.deepEqual(extra, [[['Key']], [['Enabled']]]);
});

test('setRegistryDocId during a snapshot is visible to the next getRegistry (no stale doc id)', () => {
  const ctx = liveCtx();
  ctx.DPConfig.beginSnapshot([]);
  ctx.DPConfig.setRegistryDocId('NCMMS_CORE', 'DOC123');
  const row = ctx.DPConfig.getRegistry().find((r) => r.SeriesKey === 'NCMMS_CORE');
  ctx.DPConfig.endSnapshot();
  assert.equal(row.HumanNotesDocId, 'DOC123');
  assert.equal(reads(ctx).length, 1, 'registry write located its row from the snapshot');
});

test('updateRegistryRow during a snapshot is visible to the next getRegistry', () => {
  const ctx = liveCtx();
  ctx.DPConfig.beginSnapshot([]);
  ctx.DPConfig.updateRegistryRow('NCMMS_CORE', { HumanNotesDocId: 'DOC9' });
  const row = ctx.DPConfig.getRegistry().find((r) => r.SeriesKey === 'NCMMS_CORE');
  ctx.DPConfig.endSnapshot();
  assert.equal(row.HumanNotesDocId, 'DOC9');
  assert.equal(reads(ctx).length, 1);
});

test('setFeature during a snapshot is visible to getFeatures({fresh}) (update and append)', () => {
  const ctx = liveCtx();
  ctx.DPConfig.beginSnapshot([]);
  assert.equal(ctx.DPConfig.setFeature('DRY_RUN', true).DRY_RUN, true);
  assert.equal(ctx.DPConfig.getFeatures({ fresh: true }).DRY_RUN, true);
  const id = ctx.PropertiesService.getUserProperties().getProperty('DP_HUB_SHEET_ID');
  const rows = ctx.__fakes.sheets[id].tabs[0].rows;
  rows.splice(rows.findIndex((r) => r[0] === 'GMAIL_ROUTER'), 1);
  ctx.DPConfig.endSnapshot();
  ctx.DPConfig.beginSnapshot([]);
  ctx.DPConfig.setFeature('GMAIL_ROUTER', true);
  assert.equal(ctx.DPConfig.getFeatures({ fresh: true }).GMAIL_ROUTER, true);
  ctx.DPConfig.endSnapshot();
});

test('snapshot is dropped even when the run throws', () => {
  const ctx = liveCtx();
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  ctx.DPTaskRepo = { ...ctx.DPTaskRepo, beginRun: () => { throw new Error('boom'); } };
  const r = run(ctx);
  assert.equal(r.ok, false);
  const before = reads(ctx).length;
  ctx.DPConfig.getRegistry();
  assert.equal(reads(ctx).length, before + 1, 'getRegistry after the run reads the Sheet again');
});
