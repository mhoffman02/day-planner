/**
 * @file hubWriteCombine.test.js
 * @description Phase 29 write combining: inside a ledger session, completion rows (DONE/ERROR/...)
 * are queued and ride along with the next claim's batchUpdate ([complete N, claim N+1]); every
 * PENDING claim is durable before its side effect; flush()/endSession() write whatever is left.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadEngines, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread } from './helpers/gasFakesHub.js';

const LIVE = { GMAIL_ROUTER: true, DRY_RUN: false };
const run = (ctx) => toHost(ctx._processWorkflowQueueInternal());
const writes = (ctx) => ctx.__fakes.sheetsCalls.filter((c) => /^(values\.(update|batchUpdate|append)|spreadsheets\.batchUpdate)$/.test(c.method));
const sheetOf = (ctx) => ctx.__fakes.sheets[ctx.PropertiesService.getUserProperties().getProperty('DP_HUB_SHEET_ID')];
const ledgerTab = (ctx) => sheetOf(ctx).tabs.find((t) => t.title === 'Integration Ledger').rows;
const statusOf = (ctx, threadId) => {
  const rows = ledgerTab(ctx);
  const h = rows[0];
  const row = rows.slice(1).find((r) => r[h.indexOf('SourceId')] === threadId);
  return row ? row[h.indexOf('Status')] : null;
};

function threeItemCtx() {
  const ctx = makeHubContext({ realStores: true, features: LIVE, batchSize: 25 });
  for (let i = 0; i < 3; i += 1) addThread(ctx, { id: `t${i}`, labels: ['🎯/Task'], subject: `Subject ${i}` });
  ctx.__fakes.sheetsCalls.length = 0;
  return ctx;
}

test('3-item run makes at most 4 Sheets writes and leaves every row DONE', () => {
  const ctx = threeItemCtx();
  const r = run(ctx);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.counts.processed, 3);
  assert.ok(writes(ctx).length <= 4, JSON.stringify(writes(ctx)));
  assert.equal(r.counts.sheetsWrites, writes(ctx).length);
  ['t0', 't1', 't2'].forEach((t) => assert.equal(statusOf(ctx, t), 'DONE'));
});

test('every claim is durable in the Sheet before its Task is created', () => {
  const ctx = threeItemCtx();
  const seen = [];
  ctx.__hub.tasks.onInsert = (resource) => {
    const t = ['t0', 't1', 't2'].find((id) => JSON.stringify(resource).includes(`Subject ${id.slice(1)}`));
    seen.push([t, statusOf(ctx, t)]);
  };
  run(ctx);
  assert.equal(seen.length, 3, JSON.stringify(seen));
  seen.forEach(([t, s]) => assert.equal(s, 'PENDING', `${t} claim not written before insert: ${JSON.stringify(seen)}`));
});

test('DRY_RUN run makes zero Sheets writes', () => {
  const ctx = makeHubContext({ realStores: true, features: { GMAIL_ROUTER: true, DRY_RUN: true }, batchSize: 25 });
  for (let i = 0; i < 3; i += 1) addThread(ctx, { id: `t${i}`, labels: ['🎯/Task'] });
  ctx.__fakes.sheetsCalls.length = 0;
  const r = run(ctx);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(writes(ctx).length, 0, JSON.stringify(writes(ctx)));
});

function ledgerCtx() {
  const ctx = makeGasContext();
  loadEngines(ctx);
  loadGasFile(ctx, 'Config.gs');
  loadGasFile(ctx, 'LedgerRepository.gs');
  ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', 'FOLDER1');
  ctx.DPConfig.ensureSetup();
  ctx.__fakes.sheetsCalls.length = 0;
  return ctx;
}

test('in a session a DONE row is queued, then sent with the next claim in ONE batchUpdate', () => {
  const ctx = ledgerCtx();
  ctx.DPLedgerRepo.beginSession();
  ctx.DPLedgerRepo.upsert({ OperationKey: 'K1', SourceId: 'a', Status: 'PENDING' });
  assert.equal(writes(ctx).length, 1, 'claim written immediately');
  ctx.DPLedgerRepo.upsert({ OperationKey: 'K1', Status: 'DONE' });
  assert.equal(writes(ctx).length, 1, 'completion queued');
  assert.equal(toHost(ctx.DPLedgerRepo.get('K1')).Status, 'DONE', 'session reads see the queued value');
  ctx.DPLedgerRepo.upsert({ OperationKey: 'K2', SourceId: 'b', Status: 'PENDING' });
  const w = writes(ctx);
  assert.equal(w.length, 2);
  assert.equal(w[1].method, 'values.batchUpdate');
  assert.equal(w[1].ranges.length, 2);
  ctx.DPLedgerRepo.upsert({ OperationKey: 'K2', Status: 'DONE' });
  ctx.DPLedgerRepo.flush();
  assert.equal(writes(ctx).length, 3);
  ctx.DPLedgerRepo.flush();
  assert.equal(writes(ctx).length, 3, 'empty flush makes no call');
  ctx.DPLedgerRepo.endSession();
  assert.equal(statusOf(ctx, 'a'), 'DONE');
  assert.equal(statusOf(ctx, 'b'), 'DONE');
});

test('endSession writes queued rows', () => {
  const ctx = ledgerCtx();
  ctx.DPLedgerRepo.beginSession();
  ctx.DPLedgerRepo.upsert({ OperationKey: 'K1', SourceId: 'a', Status: 'PENDING' });
  ctx.DPLedgerRepo.upsert({ OperationKey: 'K1', Status: 'DONE' });
  ctx.DPLedgerRepo.endSession();
  assert.equal(statusOf(ctx, 'a'), 'DONE');
});

test('endSession flush failure is logged with its stack and not thrown (never masks the run error)', () => {
  const ctx = ledgerCtx();
  ctx.DPLedgerRepo.beginSession();
  ctx.DPLedgerRepo.upsert({ OperationKey: 'K1', SourceId: 'a', Status: 'PENDING' });
  ctx.DPLedgerRepo.upsert({ OperationKey: 'K1', Status: 'DONE' });
  ctx.Sheets.Spreadsheets.Values.batchUpdate = () => { throw new Error('quota'); };
  const logged = [];
  const orig = ctx.console.error;
  ctx.console.error = (...a) => logged.push(a.join(' '));
  try {
    ctx.DPLedgerRepo.endSession();
  } finally {
    ctx.console.error = orig;
  }
  assert.ok(logged.some((l) => l.includes('quota') && l.includes('endSession')), JSON.stringify(logged));
  assert.equal(statusOf(ctx, 'a'), 'PENDING', 'row stays PENDING and retries after the stale window');
});

test('explicit flush failure throws (fail loud)', () => {
  const ctx = ledgerCtx();
  ctx.DPLedgerRepo.beginSession();
  ctx.DPLedgerRepo.upsert({ OperationKey: 'K1', SourceId: 'a', Status: 'PENDING' });
  ctx.DPLedgerRepo.upsert({ OperationKey: 'K1', Status: 'DONE' });
  ctx.Sheets.Spreadsheets.Values.batchUpdate = () => { throw new Error('quota'); };
  assert.throws(() => ctx.DPLedgerRepo.flush(), /quota/);
  ctx.DPLedgerRepo.endSession();
});

test('outside a session upsert still writes through immediately', () => {
  const ctx = ledgerCtx();
  ctx.DPLedgerRepo.upsert({ OperationKey: 'K1', SourceId: 'a', Status: 'PENDING' });
  ctx.DPLedgerRepo.upsert({ OperationKey: 'K1', Status: 'DONE' });
  assert.equal(statusOf(ctx, 'a'), 'DONE');
});
