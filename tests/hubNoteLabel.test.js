/**
 * @file hubNoteLabel.test.js
 * @description 🎯/Note files an email for later lookup: the queue records subject, sender and Gmail link in the
 * ledger (no Task, no Doc write), gated by the NOTES flag, and getFiledEmails lists those rows newest first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread } from './helpers/gasFakesHub.js';

const TICK = '2026-10-06T16:00:00Z';
const tick = (ctx) => toHost(ctx._hubDispatchInternal());
const rows = (ctx) => [...ctx.__hub.ledger.rows.values()];
const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));

function filed(features = { GMAIL_ROUTER: true, NOTES: true, DRY_RUN: false }) {
  const ctx = makeHubContext({ features, now: TICK });
  addThread(ctx, { id: 'n1', labels: ['🎯/Note'], archived: true, subject: 'Contract renewal terms' });
  return ctx;
}

test('a Note-labelled archived thread is recorded in the ledger with subject, sender and link, and makes no Task', () => {
  const ctx = filed();
  tick(ctx);
  const row = rows(ctx).find((r) => r.OperationKey === 'GMAIL|n1|NOTE');
  assert.ok(row, 'ledger row exists');
  assert.equal(row.Status, 'DONE');
  assert.equal(row.TargetType, 'EMAIL_NOTE');
  const m = JSON.parse(row.MetadataJson);
  assert.equal(m.subject, 'Contract renewal terms');
  assert.equal(m.from, 'Pat Example');
  assert.match(m.url, /^https:\/\/mail\.google\.com.*n1$/);
  assert.equal(m.filedOn, '2026-10-06');
  assert.equal(rows(ctx).filter((r) => r.TargetType === 'TASK').length, 0, 'no Task created');
});

test('with the NOTES flag off a Note label is ignored', () => {
  const ctx = filed({ GMAIL_ROUTER: true, NOTES: false, DRY_RUN: false });
  tick(ctx);
  assert.equal(rows(ctx).length, 0);
});

test('a second pass does not file the same thread twice', () => {
  const ctx = filed();
  tick(ctx);
  tick(ctx);
  assert.equal(rows(ctx).filter((r) => r.OperationKey === 'GMAIL|n1|NOTE').length, 1);
});

test('getFiledEmails lists filed rows newest first and respects the NOTES flag', () => {
  const ctx = filed();
  tick(ctx);
  const r = call(ctx, 'getFiledEmails', 30);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.items.map((i) => i.subject), ['Contract renewal terms']);
  assert.deepEqual(Object.keys(r.items[0]).sort(), ['filedOn', 'fromName', 'gmailUrl', 'subject']);
  const off = makeHubContext({ features: { GMAIL_ROUTER: true, NOTES: false }, now: TICK });
  assert.equal(call(off, 'getFiledEmails', 30).errorCode, 'FLAG_OFF');
});

test('getFiledEmails drops rows older than the window', () => {
  const ctx = filed();
  tick(ctx);
  const key = 'GMAIL|n1|NOTE';
  const row = ctx.__hub.ledger.rows.get(key);
  row.MetadataJson = JSON.stringify({ ...JSON.parse(row.MetadataJson), filedOn: '2026-01-01' });
  assert.equal(call(ctx, 'getFiledEmails', 30).items.length, 0);
});
