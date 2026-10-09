import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGasContext, loadEngines, toHost } from './helpers/gasRuntimeStubs.js';

const integrationDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'integration');

async function esmExportNames() {
  const names = [];
  for (const f of fs.readdirSync(integrationDir).filter((x) => x.endsWith('.js'))) {
    const mod = await import(path.join(integrationDir, f));
    names.push(...Object.keys(mod));
  }
  return names.sort();
}

test('(j) DPEngines is the only new global and is frozen', () => {
  const ctx = makeGasContext();
  const before = new Set(Object.getOwnPropertyNames(ctx));
  const engines = loadEngines(ctx);
  const added = Object.getOwnPropertyNames(ctx).filter((n) => !before.has(n));
  assert.deepEqual(added, ['DPEngines']);
  assert.ok(Object.isFrozen(engines));
  assert.throws(() => { 'use strict'; engines.EXTRA = 1; }, TypeError);
});

test('(j) DPEngines exposes exactly the exports of the ESM modules', async () => {
  const engines = loadEngines(makeGasContext());
  assert.deepEqual(Object.keys(engines).sort(), await esmExportNames());
  for (const key of ['decideOperation', 'planTaskFromThread', 'planOccurrenceSection', 'planBatch']) {
    assert.equal(typeof engines[key], 'function', key);
  }
});

test('vm-loaded engines behave like the ESM modules (cross-realm via toHost)', async () => {
  const engines = loadEngines(makeGasContext());
  const esm = await import('../src/integration/notesPlanner.js');
  const doc = { paragraphs: [{ text: 'T', style: 'TITLE' }] };
  const occ = { occurrenceId: 'E1', date: '2026-10-06', displayName: 'NCMMS Core Team' };
  assert.deepEqual(toHost(engines.planOccurrenceSection(doc, occ)), toHost(esm.planOccurrenceSection(doc, occ)));
  assert.deepEqual(engines.NOTES_SECTIONS.length, 6);
});

test('(b) two simulated concurrent triggers via the vm LockService: one PROCEEDs, one WAIT_IN_FLIGHT', () => {
  const ctx = makeGasContext();
  const engines = loadEngines(ctx);
  const rows = new Map();
  const store = { get: (k) => rows.get(k) || null, put: (r) => rows.set(r.OperationKey, r) };
  const op = { opKey: 'GMAIL|t1|TASK', sourceType: 'GMAIL', sourceId: 't1', action: 'CREATE_TASK', targetType: 'TASK' };
  const clock = () => new Date('2026-10-06T12:00:00Z');

  // Trigger B starts while trigger A still holds the script lock -> waits.
  const lockA = ctx.LockService.getScriptLock();
  const lockB = ctx.LockService.getScriptLock();
  assert.equal(lockA.tryLock(), true);
  assert.equal(lockB.tryLock(), false);
  const whileHeld = engines.claimOperation({ store, lock: lockB, clock, op });
  assert.equal(whileHeld.action, 'WAIT_IN_FLIGHT');
  lockA.releaseLock();

  // Sequential claims after release: first PROCEEDs, second sees the fresh PENDING row.
  const first = engines.claimOperation({ store, lock: ctx.LockService.getScriptLock(), clock, op });
  const second = engines.claimOperation({ store, lock: ctx.LockService.getScriptLock(), clock, op });
  assert.deepEqual([first.action, second.action], ['PROCEED', 'WAIT_IN_FLIGHT']);
  assert.equal(ctx.LockService.state.holder, null);
});

test('stubs: Utilities digest/base64, Properties, Cache, Advanced fakes', () => {
  const ctx = makeGasContext();
  const digest = ctx.Utilities.computeDigest(ctx.Utilities.DigestAlgorithm.SHA_256, 'abc');
  assert.equal(digest.length, 32);
  assert.equal(ctx.Utilities.base64Encode('hi'), 'aGk=');
  ctx.PropertiesService.getScriptProperties().setProperty('k', 'v');
  assert.equal(ctx.PropertiesService.getScriptProperties().getProperty('k'), 'v');
  ctx.CacheService.getScriptCache().put('c', 1);
  assert.equal(ctx.CacheService.getScriptCache().get('c'), '1');
  const t = ctx.Tasks.Tasks.insert({ title: 'x' });
  assert.equal(ctx.Tasks.Tasks.get('@default', t.id).title, 'x');
  ctx.__fakes.inaccessibleDocs.add('D1');
  assert.throws(() => ctx.Docs.Documents.get('D1'), /permission/);
});
