/**
 * @file hubInboxOnly.test.js
 * @description User 2026-10-12: CCB mail that Gmail filters auto-archive still showed on Triage, because the board
 * listed threads by label regardless of the Inbox. Filter labels (00_AR, FYI_Candidate, VIP) now count only
 * while the thread is in the Inbox (archived means handled). 🎯/ labels, applied on purpose and often while
 * archiving, still show when archived, and so do failed operations (Retry).
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

test('filter labels count only while in the Inbox; 🎯/ labels count either way', () => {
  const b = call(setup(), 'getTriageBoard', {});
  assert.equal(b.ok, true, b.message);
  assert.deepEqual(ids(b), ['arInbox', 'readInbox', 'review']);
});

test('a failed operation on an archived thread still shows (Retry)', () => {
  const ctx = setup();
  ctx.__hub.ledger.rows.set('GMAIL|ccb|TASK', { OperationKey: 'GMAIL|ccb|TASK', SourceType: 'GMAIL', SourceId: 'ccb', Status: 'ERROR', ErrorMessage: 'x', UpdatedAt: '2026-10-05T00:00:00.000Z' });
  assert.ok(ids(call(ctx, 'getTriageBoard', {})).includes('ccb'));
});

test('filter-label listing asks Gmail for label AND INBOX; 🎯/ listing does not', () => {
  const ctx = setup();
  const seen = [];
  const list = ctx.Gmail.Users.Threads.list;
  ctx.Gmail.Users.Threads.list = (u, o) => { seen.push(o.labelIds); return list(u, o); };
  call(ctx, 'getTriageBoard', {});
  const name = (id) => ctx.__hub.gmail.labels.find((l) => l.id === id).name;
  // Arrays from the GAS sandbox are another realm: compare plain copies.
  const byLabel = JSON.parse(JSON.stringify(Object.fromEntries(seen.map((l) => [name(l[0]), Array.from(l).slice(1).map(name)]))));
  assert.deepEqual(byLabel['00_AR'], ['INBOX']);
  assert.deepEqual(byLabel.FYI_Candidate, ['INBOX']);
  assert.deepEqual(byLabel.VIP, ['INBOX']);
  assert.deepEqual(byLabel['🎯/Review'], []);
  assert.deepEqual(byLabel['🎯/Read'], []);
});
