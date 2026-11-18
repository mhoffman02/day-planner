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
  assert.equal(m.filedOn, '2026-10-05', 'filed under the email day (default test thread is 2026-10-05 13:00 PT), not the day the queue ran');
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

test('getFiledEmails(date) lists that day\'s filed rows with a snippet and respects the NOTES flag', () => {
  const ctx = filed();
  tick(ctx);
  const r = call(ctx, 'getFiledEmails', '2026-10-05');
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.items.map((i) => i.subject), ['Contract renewal terms']);
  assert.equal(call(ctx, 'getFiledEmails', '2026-10-06').items.length, 0, 'not under the day the queue ran');
  assert.deepEqual(Object.keys(r.items[0]).sort(), ['filedOn', 'fromName', 'gmailUrl', 'snippet', 'subject']);
  const off = makeHubContext({ features: { GMAIL_ROUTER: true, NOTES: false }, now: TICK });
  assert.equal(call(off, 'getFiledEmails', '2026-10-06').errorCode, 'FLAG_OFF');
});

test('getFiledEmails(date) returns only rows filed on that day', () => {
  const ctx = filed();
  tick(ctx);
  assert.equal(call(ctx, 'getFiledEmails', '2026-10-05').items.length, 1);
  assert.equal(call(ctx, 'getFiledEmails', '2026-10-04').items.length, 0);
  assert.equal(call(ctx, 'getFiledEmails', '2026-10-06').items.length, 0);
});

test('getFiledEmails rejects anything but a YYYY-MM-DD date', () => {
  const ctx = filed();
  assert.equal(call(ctx, 'getFiledEmails', 30).ok, false);
});

// 2026-11-17 user decision: the Today Notes panel hover shows the email preview, so an EMAIL_NOTE row keeps the
// capped snippet (same cap as CARRY_IN rows). Never the body.
test('the filed row keeps the capped Gmail snippet, not the body', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, NOTES: true, DRY_RUN: false }, now: TICK });
  addThread(ctx, { id: 'n1', labels: ['🎯/Note'], archived: true, subject: 'S', body: 'BODY_CANARY', snippet: 'Please review the renewal terms' });
  tick(ctx);
  const row = rows(ctx).find((r) => r.OperationKey === 'GMAIL|n1|NOTE');
  assert.equal(JSON.parse(row.MetadataJson).snippet, 'Please review the renewal terms');
  assert.ok(!row.MetadataJson.includes('BODY_CANARY'));
});

test('an ERROR row is dropped as SKIPPED when the user removed the label', () => {
  const ctx = filed();
  ctx.__hub.ledger.rows.set('GMAIL|n2|NOTE', { OperationKey: 'GMAIL|n2|NOTE', SourceType: 'GMAIL', SourceId: 'n2', Action: 'RECORD_NOTE', TargetType: 'EMAIL_NOTE', Status: 'ERROR', CreatedAt: '2026-10-01T00:00:00Z', UpdatedAt: '2026-10-01T00:00:00Z', ErrorCode: 'ERROR', ErrorMessage: 'x', MetadataJson: JSON.stringify({ attempts: 1, nextRetryAt: '2026-10-01T00:00:00Z' }) });
  addThread(ctx, { id: 'n2', labels: [], archived: true });
  tick(ctx);
  assert.equal(ctx.__hub.ledger.rows.get('GMAIL|n2|NOTE').Status, 'SKIPPED');
});

// 2026-11-18 user report: about 60 Note-it emails all landed on the day they were filed. The Notes panel files an
// email under the day it was sent or received, in the configured time zone.
const filedOnFor = (thread) => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, NOTES: true, DRY_RUN: false }, now: TICK });
  addThread(ctx, { id: 'n1', labels: ['🎯/Note'], archived: true, ...thread });
  tick(ctx);
  return JSON.parse(rows(ctx).find((r) => r.OperationKey === 'GMAIL|n1|NOTE').MetadataJson).filedOn;
};

test('an email from three weeks ago files under its own day, not the day the queue ran', () => {
  assert.equal(filedOnFor({ date: '2026-09-15T18:00:00Z' }), '2026-09-15');
});

test('the email day is the local day in the configured zone: 03:00Z is still the evening before in Pacific', () => {
  assert.equal(filedOnFor({ date: '2026-09-16T03:00:00Z' }), '2026-09-15');
});

test('a thread files under its newest message from someone else, not my own later reply', () => {
  const day = (iso) => Date.parse(iso);
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, NOTES: true, DRY_RUN: false }, now: TICK });
  addThread(ctx, { id: 'n1', labels: ['🎯/Note'], archived: true, date: '2026-09-10T18:00:00Z', messages: [
    { from: 'Pat Example <pat@example.test>' },
    { from: 'me@example.test' }
  ] });
  ctx.__hub.gmail.threads.n1.messages[1].internalDate = day('2026-09-20T18:00:00Z');
  tick(ctx);
  assert.equal(JSON.parse(rows(ctx).find((r) => r.OperationKey === 'GMAIL|n1|NOTE').MetadataJson).filedOn, '2026-09-10');
});

// The repair for rows filed before the fix: re-dates each filed email from its Gmail message and is safe to run twice.
test('refileEmailNotesByDay moves rows stamped with the run day to the email day, and a second run changes nothing', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, NOTES: true, DRY_RUN: false }, now: TICK });
  addThread(ctx, { id: 'n1', labels: ['🎯/Note'], archived: true, date: '2026-09-15T18:00:00Z', subject: 'Old one' });
  tick(ctx);
  const key = 'GMAIL|n1|NOTE';
  const row = ctx.__hub.ledger.rows.get(key);
  row.MetadataJson = JSON.stringify({ ...JSON.parse(row.MetadataJson), filedOn: '2026-10-06' });
  const first = call(ctx, 'refileEmailNotesByDay');
  assert.equal(first.ok, true, first.message);
  assert.equal(first.moved, 1);
  assert.equal(JSON.parse(ctx.__hub.ledger.rows.get(key).MetadataJson).filedOn, '2026-09-15');
  assert.deepEqual(call(ctx, 'getFiledEmails', '2026-09-15').items.map((i) => i.subject), ['Old one']);
  const second = call(ctx, 'refileEmailNotesByDay');
  assert.equal(second.moved, 0);
  assert.equal(second.unchanged, 1);
});

test('refileEmailNotesByDay is refused with the NOTES flag off', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, NOTES: false }, now: TICK });
  assert.equal(call(ctx, 'refileEmailNotesByDay').errorCode, 'FLAG_OFF');
});
