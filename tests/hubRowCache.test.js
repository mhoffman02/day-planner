/**
 * @file hubRowCache.test.js
 * @description Gmail quota (live WORK 2026-10-12): threads.list already returns each thread's historyId, which
 * changes on any new message or label change. A scored Triage row is kept in the user's CacheService (6 h) keyed
 * by thread id with that historyId; a later board re-reads only threads whose historyId moved. Ledger status and
 * queue are always recomputed. Bodies never reach the cache.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread, lines } from './helpers/gasFakesHub.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const rows = (b) => Object.values(b.queues || {}).flat();
const gets = (ctx) => ctx.__hub.gmail.calls.filter((c) => c.startsWith('threads.get')).length;
const strip = (b) => rows(b).map(({ threadId, subject, snippet, fromName, labels, score, band, signals, queue, ledgerStatus }) => ({ threadId, subject, snippet, fromName, labels, score, band, signals, queue, ledgerStatus }))
  .sort((a, b) => a.threadId.localeCompare(b.threadId));

function setup(n = 3) {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true, DRY_RUN: false } });
  for (let i = 0; i < n; i += 1) addThread(ctx, { id: `t${i}`, labels: ['INBOX', '00_AR'], subject: `S${i}`, body: `Please approve by Friday BODY_CANARY_${i}`, snippet: `snip ${i}` });
  return ctx;
}

test('second board with unchanged threads: no thread reads, identical rows', () => {
  const ctx = setup(3);
  const first = call(ctx, 'getTriageBoard', {});
  assert.equal(gets(ctx), 3);
  const second = call(ctx, 'getTriageBoard', {});
  assert.equal(second.ok, true);
  assert.equal(gets(ctx), 3, 'no Gmail thread reads for unchanged threads');
  assert.deepEqual(strip(second), strip(first));
});

test('a thread whose historyId moved (label change) is the only one re-read', () => {
  const ctx = setup(3);
  ctx.__hub.gmail.labelId('VIP'); // label exists before the run (the label list is memoized per execution)
  call(ctx, 'getTriageBoard', {});
  ctx.Gmail.Users.Threads.modify({ addLabelIds: [ctx.__hub.gmail.labelId('VIP')] }, 'me', 't1'); // user labels it in Gmail
  const before = gets(ctx);
  const b = call(ctx, 'getTriageBoard', {});
  assert.equal(gets(ctx) - before, 1);
  assert.ok(rows(b).find((r) => r.threadId === 't1').labels.includes('VIP'), 'fresh labels for the changed thread');
});

test('ledger status and queue are recomputed for cached rows', () => {
  const ctx = setup(1);
  call(ctx, 'getTriageBoard', {});
  ctx.__hub.ledger.rows.set('GMAIL|t0|TASK', { OperationKey: 'GMAIL|t0|TASK', SourceType: 'GMAIL', SourceId: 't0', Status: 'ERROR', ErrorMessage: 'x', UpdatedAt: '2026-10-05T00:00:00.000Z' });
  const b = call(ctx, 'getTriageBoard', {});
  assert.equal(gets(ctx), 1, 'served from cache');
  const r = rows(b)[0];
  assert.equal(r.ledgerStatus, 'ERROR');
  assert.equal(r.operationKey, 'GMAIL|t0|TASK');
  assert.equal(b.queues.systemExceptions.length, 1, 'an ERROR row moves to System Exceptions');
});

test('cache holds display rows with a 6 h TTL and never a message body', () => {
  const ctx = setup(2);
  call(ctx, 'getTriageBoard', {});
  const dump = JSON.stringify([...ctx.__hub.cache.store.entries()]);
  assert.ok(dump.includes('snip 0'));
  assert.ok(!/BODY_CANARY/.test(dump), 'a message body reached the cache');
  assert.ok(!/bodyText/.test(dump));
  assert.ok([...ctx.__hub.cache.ttl.values()].every((t) => t > 0 && t <= 21600));
});

test('countOnly reads use the cache but never write it', () => {
  const ctx = setup(2);
  call(ctx, 'getTriageBoard', { countOnly: true });
  assert.equal(ctx.__hub.cache.store.size, 0);
  call(ctx, 'getTriageBoard', {});
  const before = gets(ctx);
  call(ctx, 'getTriageBoard', { countOnly: true });
  assert.equal(gets(ctx), before);
});

test('a failing cache read is logged and the board is built from Gmail', () => {
  const ctx = setup(2);
  ctx.__hub.cache.failGet = 'Cache service unavailable';
  const b = call(ctx, 'getTriageBoard', {});
  assert.equal(b.ok, true);
  assert.equal(rows(b).length, 2);
  assert.match(lines(ctx), /Cache service unavailable/);
});
