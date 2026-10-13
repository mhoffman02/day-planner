/**
 * @file hubArchiveTrash.test.js
 * @description Triage [Archive] / [Delete] (gmail.modify). Archive removes ONLY the INBOX label (the queue
 * depends on 🎯 labels never being removed); Delete moves the thread to Gmail Trash (Threads.trash, never a
 * permanent delete). Both write Gmail first, then a DISMISS ledger row so the item leaves the Triage board.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread } from './helpers/gasFakesHub.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const ON = { GMAIL_ROUTER: true, TRIAGE_BOARD: true, DRY_RUN: false };
const writes = (ctx) => ctx.__hub.gmail.calls.filter((c) => /^threads\.(modify|trash|delete)/.test(c));
const labelsOf = (ctx, id) => ctx.__hub.gmail.threads[id].messages[0].labelIds;
const onBoard = (ctx, id) => Object.values(call(ctx, 'getTriageBoard', {}).queues).flat().some((t) => t.threadId === id);

function setup(features = ON) {
  const ctx = makeHubContext({ features });
  addThread(ctx, { id: 'a1', labels: ['INBOX', '00_AR', '🎯/Task'], subject: 'Approval needed' });
  return ctx;
}

test('archiveTriageThread removes exactly INBOX, keeps 🎯 labels, and drops the item from the board', () => {
  const ctx = setup();
  const target = ctx.__hub.gmail.labelId('🎯/Task');
  assert.equal(onBoard(ctx, 'a1'), true);
  const r = call(ctx, 'archiveTriageThread', 'a1');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.status, 'DONE');
  assert.match(r.message, /Archived/);
  assert.deepEqual(writes(ctx), ['threads.modify:{"removeLabelIds":["INBOX"]}']);
  assert.ok(!labelsOf(ctx, 'a1').includes('INBOX'));
  assert.ok(labelsOf(ctx, 'a1').includes(target), '🎯 label must survive archive');
  assert.equal(onBoard(ctx, 'a1'), false);
});

test('trashTriageThread moves the thread to Gmail Trash (never a permanent delete) and drops it from the board', () => {
  const ctx = setup();
  const r = call(ctx, 'trashTriageThread', 'a1');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.status, 'DONE');
  assert.match(r.message, /Trash/);
  assert.deepEqual(writes(ctx), ['threads.trash']);
  assert.equal(ctx.__hub.gmail.threads.a1.trashed, true);
  assert.equal(onBoard(ctx, 'a1'), false);
});

test('archive and delete repeat safely (Gmail writes are idempotent; one DISMISS row)', () => {
  const ctx = setup();
  assert.equal(call(ctx, 'archiveTriageThread', 'a1').ok, true);
  const again = call(ctx, 'archiveTriageThread', 'a1');
  assert.equal(again.ok, true, JSON.stringify(again));
  assert.equal(writes(ctx).length, 2, 'user asked twice, Gmail is told twice');
  assert.equal([...ctx.__hub.ledger.rows.keys()].filter((k) => /\|DISMISS$/.test(k)).length, 1);
});

for (const [rpc, would] of [['archiveTriageThread', /Would archive/], ['trashTriageThread', /Would move .*Trash/]]) {
  test(`${rpc}: DRY_RUN writes nothing and says what it would do`, () => {
    const ctx = setup({ ...ON, DRY_RUN: true });
    const r = call(ctx, rpc, 'a1');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.status, 'DRY_RUN');
    assert.match(r.message, would);
    assert.deepEqual(writes(ctx), []);
    assert.equal(ctx.__hub.ledger.rows.size, 0);
  });

  test(`${rpc}: flag off, bad id and missing thread fail without touching Gmail`, () => {
    const off = setup({ GMAIL_ROUTER: false });
    assert.equal(call(off, rpc, 'a1').errorCode, 'FLAG_OFF');
    const ctx = setup();
    assert.equal(call(ctx, rpc, 'bad|id').errorCode, 'INVALID_THREAD_ID');
    assert.deepEqual(writes(off).concat(writes(ctx)), []);
    // Live path: no separate existence read; Gmail's own 404 on the write maps to THREAD_NOT_FOUND, nothing recorded.
    assert.equal(call(ctx, rpc, 'nope123').errorCode, 'THREAD_NOT_FOUND');
    assert.equal(ctx.__hub.ledger.rows.size, 0);
    assert.equal(call(setup({ ...ON, DRY_RUN: true }), rpc, 'nope123').errorCode, 'THREAD_NOT_FOUND', 'trial mode still checks the thread exists');
  });

  test(`${rpc}: live write is a single Gmail call (no extra thread read)`, () => {
    const ctx = setup();
    assert.equal(call(ctx, rpc, 'a1').ok, true);
    assert.equal(ctx.__hub.gmail.calls.filter((c) => c.startsWith('threads.get')).length, 0, ctx.__hub.gmail.calls.join(','));
  });

  test(`${rpc}: a Gmail write failure fails loud and leaves no DISMISS row (item stays visible)`, () => {
    const ctx = setup();
    ctx.__hub.gmail.failWrite = 'Request had insufficient authentication scopes.';
    const r = call(ctx, rpc, 'a1');
    assert.equal(r.ok, false);
    assert.match(r.message, /insufficient authentication scopes/);
    assert.equal(ctx.__hub.ledger.rows.size, 0);
    const inbox = ctx.__hub.gmail.labelId('INBOX');
    const t = ctx.__hub.gmail.threads.a1;
    assert.ok(t.messages.every((m) => m.labelIds.includes(inbox)) && !t.trashed, 'a failed write leaves the thread in the Inbox');
    assert.equal(onBoard(ctx, 'a1'), true);
  });
}

test('only GmailRepository writes Gmail, only via Threads.modify/trash; no permanent delete anywhere', () => {
  const dir = new URL('../gas-app/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.gs'))) {
    const src = fs.readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /\.(Threads|Messages)\.(delete|batchDelete)\s*\(/, `${f}: permanent delete`);
    assert.doesNotMatch(src, /\.Messages\.(modify|trash|batchModify)\s*\(/, `${f}: message-level write`);
    if (f !== 'GmailRepository.gs') assert.doesNotMatch(src, /\.Threads\.(modify|trash)\s*\(/, `${f}: Gmail write outside GmailRepository`);
  }
});
