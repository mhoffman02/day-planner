import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEDGER_COLUMNS, LEDGER_STATUS } from '../src/integration/contracts.js';
import {
  decideOperation, beginOp, completeOp, failOp, deferOp, sanitizeError, maskId,
  dryRunMessage, claimOperation, runOperation
} from '../src/integration/ledger.js';

const T0 = new Date('2026-10-06T12:00:00Z');
const plus = (mins) => new Date(T0.getTime() + mins * 60000);
const op = { opKey: 'GMAIL|t1|TASK', sourceType: 'GMAIL', sourceId: 't1', sourceVersion: 'm9', action: 'CREATE_TASK', targetType: 'TASK', kind: 'TASK' };

function makeStore() {
  const rows = new Map();
  const puts = [];
  return { rows, puts, get: (k) => rows.get(k) || null, put: (r) => { puts.push(r); rows.set(r.OperationKey, { ...r }); } };
}
const openLock = () => {
  let held = false;
  return { tryLock: () => (held ? false : (held = true)), releaseLock: () => { held = false; }, isHeld: () => held };
};

test('rows match LEDGER_COLUMNS exactly', () => {
  const row = beginOp(op, T0);
  assert.deepEqual(Object.keys(row), [...LEDGER_COLUMNS]);
  assert.equal(row.Status, LEDGER_STATUS.PENDING);
  assert.equal(row.CreatedAt, T0.toISOString());
});

test('decideOperation: no row proceeds; DONE skips; fresh PENDING waits; stale PENDING retries; ERROR retries', () => {
  assert.equal(decideOperation(null, T0).action, 'PROCEED');
  const pending = beginOp(op, T0);
  assert.equal(decideOperation(completeOp(pending, plus(1), { targetId: 'x' }), plus(2)).action, 'SKIP_DONE');
  assert.equal(decideOperation(pending, plus(5), { staleMinutes: 15 }).action, 'WAIT_IN_FLIGHT');
  assert.equal(decideOperation(pending, plus(16), { staleMinutes: 15 }).action, 'RETRY');
  assert.equal(decideOperation(failOp(pending, plus(1), new Error('x')), plus(2)).action, 'RETRY');
  assert.equal(decideOperation(deferOp(pending, plus(1), 'CUTOFF_PASSED'), plus(2)).action, 'PROCEED');
});

test('transitions PENDING->DONE|ERROR|DEFERRED and reject illegal ones', () => {
  const p = beginOp(op, T0);
  const d = completeOp(p, plus(1), { targetId: 'task9', targetType: 'TASK' });
  assert.equal(d.Status, 'DONE');
  assert.equal(d.TargetId, 'task9');
  assert.equal(d.CreatedAt, p.CreatedAt);
  assert.equal(failOp(p, plus(1), 'boom').Status, 'ERROR');
  assert.equal(deferOp(p, plus(1), 'CUTOFF_PASSED').Status, 'DEFERRED');
  assert.throws(() => completeOp(d, plus(2), {}), /PENDING/);
  assert.throws(() => beginOp({ ...op, opKey: '' }, T0), /opKey/);
});

test('(g) DRY_RUN yields the spec strings and mutates nothing', () => {
  assert.equal(dryRunMessage('CREATE_TASK'), 'Would create Task');
  assert.equal(dryRunMessage('ROUTE_MEETING', { occurrenceId: 'EV1' }), 'Would route to NCMMS Core occurrence EV1');
  assert.equal(dryRunMessage('APPEND_CARRY_IN', { docId: '1AbCdEfGhIjKlMnOp' }), `Would append carry-in to Doc ${maskId('1AbCdEfGhIjKlMnOp')}`);
  assert.equal(dryRunMessage('SKIP_DONE'), 'Would skip because already processed');
  assert.equal(dryRunMessage('DEFER_CUTOFF'), 'Would defer because cutoff passed');
  assert.throws(() => dryRunMessage('NOPE'), /Unknown/);
  assert.ok(!maskId('1AbCdEfGhIjKlMnOp').includes('CdEfGhIjKlMn'));

  const store = makeStore();
  const lock = openLock();
  const r = claimOperation({ store, lock, clock: () => T0, op, dryRun: true });
  assert.equal(r.action, 'WOULD_PROCEED');
  assert.deepEqual(r.messages, ['Would create Task']);
  const m = claimOperation({ store, lock, clock: () => T0, op: { ...op, kind: 'MEETING', occurrenceId: 'EV1', docId: 'DOC123456789' }, dryRun: true });
  assert.deepEqual(m.messages, ['Would route to NCMMS Core occurrence EV1', `Would append carry-in to Doc ${maskId('DOC123456789')}`]);
  const dfr = claimOperation({ store, lock, clock: () => T0, op: { ...op, deferReason: 'CUTOFF_PASSED' }, dryRun: true });
  assert.equal(dfr.action, 'WOULD_DEFER');
  assert.deepEqual(dfr.messages, ['Would defer because cutoff passed']);
  assert.equal(store.puts.length, 0);
  assert.equal(lock.isHeld(), false);
  store.put(completeOp(beginOp(op, T0), T0, {}));
  const s = claimOperation({ store, lock, clock: () => T0, op, dryRun: true });
  assert.equal(s.action, 'WOULD_SKIP_DONE');
  assert.deepEqual(s.messages, ['Would skip because already processed']);
  assert.equal(store.puts.length, 1);
});

test('(a) duplicate routing returns SKIP_DONE and creates nothing', () => {
  const store = makeStore();
  let creates = 0;
  const work = () => { creates += 1; return { targetId: 'task1', targetType: 'TASK' }; };
  const args = { store, lock: openLock(), clock: () => T0, op, work };
  assert.equal(runOperation(args).action, 'DONE');
  const again = runOperation(args);
  assert.equal(again.action, 'SKIP_DONE');
  assert.equal(creates, 1);
});

test('(b) two triggers on same op: exactly one PROCEEDs, other WAIT_IN_FLIGHT', () => {
  const store = makeStore();
  const lock = openLock();
  const a = claimOperation({ store, lock, clock: () => T0, op });
  const b = claimOperation({ store, lock, clock: () => plus(1), op });
  assert.deepEqual([a.action, b.action], ['PROCEED', 'WAIT_IN_FLIGHT']);
  lock.tryLock();
  const c = claimOperation({ store, lock, clock: () => T0, op: { ...op, opKey: 'GMAIL|t2|TASK' } });
  assert.equal(c.action, 'WAIT_IN_FLIGHT');
  assert.equal(store.rows.has('GMAIL|t2|TASK'), false);
});

test('(f) recoverable failure -> ERROR row then retry succeeds', () => {
  const store = makeStore();
  let n = 0;
  const work = () => {
    n += 1;
    if (n === 1) { const e = new Error('Service unavailable'); e.code = 'TRANSIENT'; e.retryable = true; throw e; }
    return { targetId: 'task1' };
  };
  const args = { store, lock: openLock(), clock: () => T0, op, work };
  const first = runOperation(args);
  assert.equal(first.ok, false);
  assert.equal(first.action, 'ERROR');
  assert.equal(first.retryable, true);
  assert.equal(store.rows.get(op.opKey).Status, 'ERROR');
  assert.equal(store.rows.get(op.opKey).ErrorCode, 'TRANSIENT');
  const second = runOperation(args);
  assert.equal(second.ok, true);
  assert.equal(second.action, 'DONE');
  assert.equal(store.rows.get(op.opKey).Status, 'DONE');
});

test('runOperation defers when op.deferReason set and writes DEFERRED without calling work', () => {
  const store = makeStore();
  let called = false;
  const r = runOperation({ store, lock: openLock(), clock: () => T0, op: { ...op, deferReason: 'CUTOFF_PASSED' }, work: () => { called = true; return {}; } });
  assert.equal(r.action, 'DEFER');
  assert.equal(called, false);
  assert.equal(store.rows.get(op.opKey).Status, 'DEFERRED');
});

test('completion-write crash leaves PENDING that goes stale and is retried', () => {
  const store = makeStore();
  const realPut = store.put;
  let fail = true;
  store.put = (r) => { if (fail && r.Status === 'DONE') throw new Error('sheet write failed'); realPut(r); };
  const args = { store, lock: openLock(), clock: () => T0, op, work: () => ({ targetId: 't' }) };
  assert.throws(() => runOperation(args), /sheet write failed/);
  assert.equal(store.rows.get(op.opKey).Status, 'PENDING');
  fail = false;
  assert.equal(runOperation({ ...args, clock: () => plus(5) }).action, 'WAIT_IN_FLIGHT');
  assert.equal(runOperation({ ...args, clock: () => plus(20) }).action, 'DONE');
});

test('(k) sanitizeError strips emails, long ids, urls, extra lines and caps length', () => {
  const longId = 'A'.repeat(40);
  const err = new Error(`Failed for bob.smith+x@gsa.gov thread ${longId} see https://mail.google.com/mail/u/0/#inbox/${longId}\nBody: secret text secret text`);
  const out = sanitizeError(err, 80);
  assert.ok(!/@/.test(out));
  assert.ok(!out.includes(longId));
  assert.ok(!out.includes('secret'));
  assert.ok(out.length <= 80);
  assert.ok(sanitizeError('x'.repeat(5000)).length <= 200);
  assert.equal(sanitizeError(undefined), 'Unknown error');
  const row = failOp(beginOp(op, T0), T0, new Error('mail to a@b.com failed'));
  assert.ok(!/@/.test(row.ErrorMessage));
});
