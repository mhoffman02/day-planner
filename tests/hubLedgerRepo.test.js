/**
 * @file hubLedgerRepo.test.js
 * @description vm tests for gas-app/LedgerRepository.gs (DPLedgerRepo) against the Sheets fake.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadEngines, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';

function setup() {
  const ctx = makeGasContext();
  loadEngines(ctx);
  loadGasFile(ctx, 'Config.gs');
  loadGasFile(ctx, 'LedgerRepository.gs');
  ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', 'FOLDER1');
  ctx.DPConfig.ensureSetup();
  return ctx;
}

const writes = (ctx) => ctx.__fakes.sheetsCalls.filter((c) => /^values\.(update|batchUpdate|append)$/.test(c.method));
const ledgerRows = (ctx) => {
  const id = ctx.PropertiesService.getUserProperties().getProperty('DP_HUB_SHEET_ID');
  return ctx.__fakes.sheets[id].tabs.find((t) => t.title === 'Integration Ledger').rows;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('(e) upsert same OperationKey twice => one row, UpdatedAt changes, CreatedAt stable', async () => {
  const ctx = setup();
  const first = ctx.DPLedgerRepo.upsert({ OperationKey: 'GMAIL|t1|TASK', SourceType: 'GMAIL', SourceId: 't1', Status: 'PENDING' });
  await wait(5);
  const second = ctx.DPLedgerRepo.upsert({ OperationKey: 'GMAIL|t1|TASK', Status: 'DONE', TargetId: 'task9' });
  assert.equal(ledgerRows(ctx).length, 2); // header + 1
  assert.equal(second.CreatedAt, first.CreatedAt);
  assert.notEqual(second.UpdatedAt, first.UpdatedAt);
  const stored = toHost(ctx.DPLedgerRepo.get('GMAIL|t1|TASK'));
  assert.equal(stored.Status, 'DONE');
  assert.equal(stored.SourceId, 't1'); // untouched fields survive the merge
  assert.equal(stored.TargetId, 'task9');
  assert.equal(stored.CreatedAt, first.CreatedAt);
  assert.equal(ctx.DPLedgerRepo.get('missing'), null);
});

test('(e) caller-supplied CreatedAt cannot rewrite history on update; explicit UpdatedAt is honoured', () => {
  const ctx = setup();
  ctx.DPLedgerRepo.upsert({ OperationKey: 'K', CreatedAt: '2026-01-01T00:00:00.000Z', UpdatedAt: '2026-01-01T00:00:00.000Z' });
  const r = ctx.DPLedgerRepo.upsert({ OperationKey: 'K', CreatedAt: '2030-01-01T00:00:00.000Z', UpdatedAt: '2026-02-02T00:00:00.000Z', Status: 'DONE' });
  assert.equal(r.CreatedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(r.UpdatedAt, '2026-02-02T00:00:00.000Z');
});

test('(f) list filters by status and sourceType', () => {
  const ctx = setup();
  ctx.DPLedgerRepo.upsert({ OperationKey: 'A', SourceType: 'GMAIL', Status: 'PENDING' });
  ctx.DPLedgerRepo.upsert({ OperationKey: 'B', SourceType: 'GMAIL', Status: 'DONE' });
  ctx.DPLedgerRepo.upsert({ OperationKey: 'C', SourceType: 'GEMINI', Status: 'DONE' });
  const keys = (f) => toHost(ctx.DPLedgerRepo.list(f).map((r) => r.OperationKey));
  assert.deepEqual(keys({ status: 'DONE' }), ['B', 'C']);
  assert.deepEqual(keys({ status: 'DONE', sourceType: 'GMAIL' }), ['B']);
  assert.deepEqual(keys({}), ['A', 'B', 'C']);
  assert.deepEqual(keys({ status: 'ERROR' }), []);
});

test('(g) appendMany is exactly one Sheets write call; no per-cell writes', () => {
  const ctx = setup();
  const before = writes(ctx).length;
  const n = ctx.DPLedgerRepo.appendMany([{ OperationKey: 'X1' }, { OperationKey: 'X2', Status: 'DRY_RUN' }, { OperationKey: 'X3' }]);
  assert.equal(n, 3);
  const calls = writes(ctx).slice(before);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'values.append');
  assert.equal(calls[0].rows, 3);
  assert.equal(calls[0].valueInputOption, 'RAW');
  assert.equal(ledgerRows(ctx).length, 4);
  assert.equal(ctx.DPLedgerRepo.appendMany([]), 0);
  assert.throws(() => ctx.DPLedgerRepo.appendMany([{ OperationKey: 'X1' }]), /LEDGER_DUPLICATE_KEY/);
  assert.throws(() => ctx.DPLedgerRepo.appendMany([{ OperationKey: 'N1' }, { OperationKey: 'N1' }]), /LEDGER_DUPLICATE_KEY/);
  assert.equal(ledgerRows(ctx).length, 4); // failed batches wrote nothing
});

test('upsert is one read + one write; rejects missing OperationKey and oversized cells', () => {
  const ctx = setup();
  ctx.DPLedgerRepo.upsert({ OperationKey: 'Z' });
  const mark = ctx.__fakes.sheetsCalls.length;
  ctx.DPLedgerRepo.upsert({ OperationKey: 'Z', Status: 'DONE' });
  const calls = ctx.__fakes.sheetsCalls.slice(mark).map((c) => c.method);
  assert.deepEqual(toHost(calls), ['values.get', 'values.update']);
  assert.throws(() => ctx.DPLedgerRepo.upsert({ Status: 'DONE' }), /OperationKey/);
  assert.throws(() => ctx.DPLedgerRepo.upsert({ OperationKey: 'Q', MetadataJson: 'x'.repeat(40001) }), /LEDGER_CELL_TOO_LARGE/);
});

test('values are written RAW so formula-like or numeric-looking text is not coerced', () => {
  const ctx = setup();
  ctx.DPLedgerRepo.upsert({ OperationKey: '=1+1', SourceId: '0001' });
  assert.equal(ctx.DPLedgerRepo.get('=1+1').SourceId, '0001');
  assert.ok(writes(ctx).every((c) => c.valueInputOption === 'RAW'));
});
