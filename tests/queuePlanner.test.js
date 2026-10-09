import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planBatch } from '../src/integration/queuePlanner.js';

const NOW = new Date('2026-10-06T12:00:00Z');
const item = (n) => ({ opKey: `GMAIL|t${n}|TASK`, threadId: `t${n}`, label: '🎯/Task' });
const items = (n) => Array.from({ length: n }, (_, i) => item(i + 1));
const base = { cursor: 0, batchSize: 3, lockHeld: true, flags: { GMAIL_ROUTER: true }, clock: () => NOW };

test('(i) batch is bounded by batchSize and the cursor resumes to completion', () => {
  const all = items(7);
  const seen = [];
  let cursor = 0;
  let rounds = 0;
  for (;;) {
    const plan = planBatch({ ...base, items: all, cursor });
    assert.ok(plan.toProcess.length <= 3);
    seen.push(...plan.toProcess.map((i) => i.threadId));
    rounds += 1;
    if (plan.done) break;
    cursor = plan.nextCursor;
  }
  assert.equal(rounds, 3);
  assert.deepEqual(seen, all.map((i) => i.threadId));
});

test('(i) lockHeld=false refuses; GMAIL_ROUTER off is a no-op that keeps the cursor', () => {
  const refused = planBatch({ ...base, items: items(3), lockHeld: false });
  assert.equal(refused.action, 'REFUSED');
  assert.equal(refused.reason, 'LOCK_NOT_HELD');
  assert.deepEqual(refused.toProcess, []);
  assert.equal(refused.nextCursor, 0);
  const off = planBatch({ ...base, items: items(3), cursor: 2, flags: { GMAIL_ROUTER: false } });
  assert.equal(off.action, 'NOOP');
  assert.deepEqual(off.toProcess, []);
  assert.equal(off.nextCursor, 2);
  assert.equal(planBatch({ ...base, items: items(3), flags: {} }).action, 'NOOP');
});

test('(d) thread deleted after queuing -> quarantined SOURCE_MISSING, rest of batch proceeds', () => {
  const plan = planBatch({ ...base, items: items(3), isSourceAvailable: (i) => i.threadId !== 't2' });
  assert.deepEqual(plan.toProcess.map((i) => i.threadId), ['t1', 't3']);
  assert.equal(plan.quarantined.length, 1);
  const q = plan.quarantined[0];
  assert.equal(q.errorCode, 'SOURCE_MISSING');
  assert.equal(q.status, 'ERROR');
  assert.equal(q.opKey, 'GMAIL|t2|TASK');
  assert.equal(q.ledgerRow.Status, 'ERROR');
  assert.equal(q.ledgerRow.ErrorCode, 'SOURCE_MISSING');
  assert.equal(plan.done, true);
});

test('malformed item is quarantined with a sanitized message; others proceed', () => {
  const bad = { opKey: 'GMAIL|x|TASK', threadId: 42, note: 'leak@example.com' };
  const plan = planBatch({ ...base, items: [item(1), bad, null, 'str', item(2)], batchSize: 10 });
  assert.deepEqual(plan.toProcess.map((i) => i.threadId), ['t1', 't2']);
  assert.equal(plan.quarantined.length, 3);
  for (const q of plan.quarantined) {
    assert.equal(q.errorCode, 'MALFORMED_ITEM');
    assert.ok(!/@/.test(q.errorMessage));
  }
});

test('source check that throws quarantines only that item (retryable)', () => {
  const plan = planBatch({
    ...base,
    items: items(2),
    isSourceAvailable: (i) => { if (i.threadId === 't1') throw new Error('Gmail 503 for a@b.com'); return true; }
  });
  assert.deepEqual(plan.toProcess.map((i) => i.threadId), ['t2']);
  assert.equal(plan.quarantined[0].errorCode, 'SOURCE_CHECK_FAILED');
  assert.equal(plan.quarantined[0].retryable, true);
  assert.ok(!/@/.test(plan.quarantined[0].errorMessage));
});

test('invalid cursor / batchSize / items throw', () => {
  assert.throws(() => planBatch({ ...base, items: items(1), batchSize: 0 }), /batchSize/);
  assert.throws(() => planBatch({ ...base, items: items(1), cursor: -1 }), /cursor/);
  assert.throws(() => planBatch({ ...base, items: 'nope' }), /items/);
  assert.equal(planBatch({ ...base, items: items(2), cursor: 5 }).done, true);
});
