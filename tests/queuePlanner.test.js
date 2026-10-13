import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planBatch, dryPassFingerprintSource, shouldSkipDryPass, DRY_PASS_MAX_AGE_MS } from '../src/integration/queuePlanner.js';

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

// ---------------------------------------------------------------- dry-pass skip (Gmail quota while in trial mode)
const fpInput = () => ({
  items: [item(2), item(1)],
  historyIds: { t1: '10', t2: '20' },
  features: { GMAIL_ROUTER: true, DRY_RUN: true },
  settings: { batchSize: 25, timeZone: 'America/Los_Angeles' },
  registry: [{ SeriesKey: 'NCMMS_CORE', Enabled: true }]
});

test('dry-pass fingerprint ignores item order and object key order', () => {
  const a = fpInput();
  const b = fpInput();
  b.items.reverse();
  b.settings = { timeZone: 'America/Los_Angeles', batchSize: 25 };
  assert.equal(dryPassFingerprintSource(a), dryPassFingerprintSource(b));
});

test('dry-pass fingerprint changes on a thread historyId, an item, a flag, a setting or a registry row', () => {
  const base0 = dryPassFingerprintSource(fpInput());
  const mutate = [
    (x) => { x.historyIds.t1 = '11'; },
    (x) => { x.items.push(item(3)); },
    (x) => { x.features.NCMMS_CORE_PILOT = true; },
    (x) => { x.settings.batchSize = 10; },
    (x) => { x.registry[0].Enabled = false; }
  ];
  mutate.forEach((m, i) => {
    const x = fpInput();
    m(x);
    assert.notEqual(dryPassFingerprintSource(x), base0, `mutation ${i}`);
  });
});

test('shouldSkipDryPass: only a scheduled dry pass with the same fingerprint inside the max age skips', () => {
  const nowMs = Date.parse('2026-10-13T17:00:00Z');
  const last = { fp: 'abc', at: '2026-10-13T16:30:00Z' };
  const ok = { scheduled: true, dry: true, fingerprint: 'abc', last, nowMs };
  assert.equal(shouldSkipDryPass(ok), true);
  assert.equal(shouldSkipDryPass({ ...ok, scheduled: false }), false, 'manual runs always do a full pass');
  assert.equal(shouldSkipDryPass({ ...ok, dry: false }), false, 'live runs never skip');
  assert.equal(shouldSkipDryPass({ ...ok, fingerprint: 'xyz' }), false);
  assert.equal(shouldSkipDryPass({ ...ok, last: null }), false);
  assert.equal(shouldSkipDryPass({ ...ok, last: { fp: 'abc', at: 'garbage' } }), false);
  assert.equal(shouldSkipDryPass({ ...ok, nowMs: Date.parse(last.at) + DRY_PASS_MAX_AGE_MS }), false, 'stale: full pass');
  assert.equal(shouldSkipDryPass({ ...ok, nowMs: Date.parse(last.at) - 1 }), false, 'clock went backwards: full pass');
});
