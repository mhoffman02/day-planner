// Gate for the axe-core ratchet in the deploy:home live gate (axe-baseline.json counts only go down).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countByRule, compareAxe, lowerBaseline } from '../tools/lib/axe-ratchet.js';

test('countByRule counts nodes per rule id', () => {
  const violations = [
    { id: 'color-contrast', nodes: [{}, {}, {}] },
    { id: 'label', nodes: [{}] },
  ];
  assert.deepEqual(countByRule(violations), { 'color-contrast': 3, label: 1 });
});

test('countByRule rejects malformed input', () => {
  assert.throws(() => countByRule(null), /violations/);
  assert.throws(() => countByRule([{ id: 'x' }]), /nodes/);
});

test('equal or lower counts pass; improvements are reported', () => {
  const r = compareAxe({ label: 2, 'color-contrast': 3 }, { label: 2, 'color-contrast': 1 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.failures, []);
  assert.equal(r.improvements.length, 1);
  assert.match(r.improvements[0], /color-contrast.*3.*1/);
});

test('a new rule id fails with a clear message', () => {
  const r = compareAxe({ label: 2 }, { label: 2, 'aria-hidden-focus': 1 });
  assert.equal(r.ok, false);
  assert.match(r.failures[0], /NEW rule aria-hidden-focus/);
});

test('a higher count fails with before and after', () => {
  const r = compareAxe({ label: 2 }, { label: 5 });
  assert.equal(r.ok, false);
  assert.match(r.failures[0], /label.*2.*5/);
});

test('a rule that disappeared counts as improvement', () => {
  const r = compareAxe({ label: 2 }, {});
  assert.equal(r.ok, true);
  assert.equal(r.improvements.length, 1);
});

test('lowerBaseline only lowers, drops cleared rules, never adds', () => {
  assert.deepEqual(
    lowerBaseline({ a: 3, b: 2, c: 1 }, { a: 1, b: 2, d: 9 }),
    { a: 1, b: 2 },
  );
});
