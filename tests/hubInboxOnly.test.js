/**
 * @file hubInboxOnly.test.js
 * @description User 2026-10-12: CCB mail that Gmail filters auto-archive still showed on Triage. Then: "ONLY SEE
 * ITEMS IN INBOX". Every label listing asks Gmail for label AND INBOX, and a failed operation (Retry) shows only
 * while its thread is in the Inbox. Archive and Delete are single atomic Gmail calls, so a failed one leaves INBOX
 * on the thread (see hubArchiveTrash.test.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread } from './helpers/gasFakesHub.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const ids = (b) => Object.values(b.queues).flat().map((r) => r.threadId).sort();

function setup() {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true, DRY_RUN: true } });
  addThread(ctx, { id: 'ccb', archived: true, labels: ['FYI_Candidate'], subject: 'CCB minutes (auto-archived by a filter)' });
  addThread(ctx, { id: 'vipArch', archived: true, labels: ['VIP'], subject: 'VIP, already archived' });
  addThread(ctx, { id: 'arInbox', labels: ['INBOX', '00_AR'], subject: 'Approval in the Inbox' });
  addThread(ctx, { id: 'review', archived: true, labels: ['🎯/Review'], subject: 'Archived but labeled for review' });
  addThread(ctx, { id: 'readInbox', labels: ['INBOX', '🎯/Read'], subject: 'Read later, in the Inbox' });
  return ctx;
}

test('only Inbox threads show: archived threads are hidden whatever their labels', () => {
  const b = call(setup(), 'getTriageBoard', {});
  assert.equal(b.ok, true, b.message);
  assert.deepEqual(ids(b), ['arInbox', 'readInbox']);
});

test('a failed operation shows only while its thread is in the Inbox', () => {
  const ctx = setup();
  const err = (id) => ctx.__hub.ledger.rows.set(`GMAIL|${id}|TASK`, { OperationKey: `GMAIL|${id}|TASK`, SourceType: 'GMAIL', SourceId: id, Status: 'ERROR', ErrorMessage: 'x', UpdatedAt: '2026-10-05T00:00:00.000Z' });
  err('ccb');
  err('arInbox');
  const b = call(ctx, 'getTriageBoard', {});
  assert.ok(!ids(b).includes('ccb'), 'archived thread with a failed op is hidden');
  assert.equal(b.queues.systemExceptions.map((r) => r.threadId).join(), 'arInbox', 'Inbox thread with a failed op shows for Retry');
});

test('every label listing asks Gmail for label AND INBOX', () => {
  const ctx = setup();
  const seen = [];
  const list = ctx.Gmail.Users.Threads.list;
  ctx.Gmail.Users.Threads.list = (u, o) => { seen.push(o.labelIds); return list(u, o); };
  call(ctx, 'getTriageBoard', {});
  const name = (id) => ctx.__hub.gmail.labels.find((l) => l.id === id).name;
  // Arrays from the GAS sandbox are another realm: compare plain copies.
  const byLabel = JSON.parse(JSON.stringify(Object.fromEntries(seen.map((l) => [name(l[0]), Array.from(l).slice(1).map(name)]))));
  for (const label of ['00_AR', 'FYI_Candidate', 'VIP', '🎯/Review', '🎯/Read']) assert.deepEqual(byLabel[label], ['INBOX'], label);
});
