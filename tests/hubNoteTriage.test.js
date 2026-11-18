/**
 * @file hubNoteTriage.test.js
 * @description Triage [Note it] (user 2026-11-17): one Gmail write adds 🎯/Note and removes INBOX, then the NOTE
 * ledger row is recorded now (not on the next trigger tick), so the email shows in its day's Notes panel at once.
 * The write is refused when the 🎯/Note label does not exist, and DRY_RUN writes nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread } from './helpers/gasFakesHub.js';

const TICK = '2026-11-17T16:00:00Z';
const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const ON = { GMAIL_ROUTER: true, NOTES: true, TRIAGE_BOARD: true, DRY_RUN: false };
const writes = (ctx) => ctx.__hub.gmail.calls.filter((c) => /^threads\.(modify|trash|delete)/.test(c));
const rows = (ctx) => [...ctx.__hub.ledger.rows.values()];

function setup(features = ON) {
  const ctx = makeHubContext({ features, now: TICK });
  addThread(ctx, { id: 'a1', labels: ['INBOX'], subject: 'Contract renewal terms' });
  ctx.__hub.gmail.labelId('🎯/Note');
  return ctx;
}

test('noteTriageThread adds 🎯/Note, removes INBOX in one write, and records the filed email now', () => {
  const ctx = setup();
  const noteId = ctx.__hub.gmail.labelId('🎯/Note');
  const r = call(ctx, 'noteTriageThread', 'a1');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(writes(ctx), [`threads.modify:{"addLabelIds":["${noteId}"],"removeLabelIds":["INBOX"]}`]);
  const row = rows(ctx).find((x) => x.OperationKey === 'GMAIL|a1|NOTE');
  assert.equal(row.Status, 'DONE');
  assert.equal(JSON.parse(row.MetadataJson).filedOn, '2026-10-05', 'the email day (default test thread), not 2026-11-17 when it was noted');
});

test('noteTriageThread with the NOTES flag off writes nothing', () => {
  const ctx = setup({ ...ON, NOTES: false });
  assert.equal(call(ctx, 'noteTriageThread', 'a1').errorCode, 'FLAG_OFF');
  assert.deepEqual(writes(ctx), []);
});

test('noteTriageThread fails loud when the 🎯/Note label is missing', () => {
  const ctx = makeHubContext({ features: ON, now: TICK });
  addThread(ctx, { id: 'a1', labels: ['INBOX'], subject: 'x' });
  const r = call(ctx, 'noteTriageThread', 'a1');
  assert.equal(r.ok, false);
  assert.equal(r.errorCode, 'LABEL_MISSING');
  assert.deepEqual(writes(ctx), []);
});

test('noteTriageThread in DRY_RUN writes nothing', () => {
  const ctx = setup({ ...ON, DRY_RUN: true });
  const r = call(ctx, 'noteTriageThread', 'a1');
  assert.equal(r.status, 'DRY_RUN');
  assert.deepEqual(writes(ctx), []);
  assert.equal(rows(ctx).length, 0);
});
