/**
 * @file invariant.test.js
 * @description Inline invariants (Maguire): invariant(cond, msg) throws "Invariant failed: msg" right where an
 * impossible state appears, on in production. Covers the helper in all three copies (src/binderStore.js client,
 * its gas-app/Script.html mirror, src/integration/contracts.js server) and the engine sites whose bad state an
 * input can reach: a priority title that would not parse back, and a month key that is not YYYY-MM.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invariant as clientInvariant } from '../src/binderStore.js';
import { invariant as serverInvariant } from '../src/integration/contracts.js';
import { formatTaskTitle } from '../src/taskEngine.js';
import { nextMonthKey } from '../src/futureMatrixEngine.js';
import { taskPlannerLocalDate } from '../src/integration/taskPlanner.js';
import { loadScriptHtml } from './helpers/plannerHarness.js';

const { scope: gas } = loadScriptHtml({ exportNames: ['invariant', 'formatTaskTitle', 'nextMonthKey'] });

for (const [label, invariant] of [['src/binderStore.js', clientInvariant], ['gas-app/Script.html', gas.invariant], ['src/integration/contracts.js', serverInvariant]]) {
  test(`${label}: invariant passes on a true condition and throws "Invariant failed: msg" on a false one`, () => {
    assert.equal(invariant(true, 'never shown'), undefined);
    assert.throws(() => invariant(false, 'rank out of range'), { name: 'Error', message: 'Invariant failed: rank out of range' });
    assert.throws(() => invariant(0, 'zero'), /Invariant failed: zero/);
  });
}

for (const [label, m] of [['src', { formatTaskTitle, nextMonthKey }], ['gas-app/Script.html', gas]]) {
  test(`${label}: formatTaskTitle refuses a priority code that would not parse back (silent loss of priority)`, () => {
    assert.equal(m.formatTaskTitle('a', 3, ' Call Bob '), '[A3] Call Bob');
    assert.equal(m.formatTaskTitle(null, null, 'plain'), 'plain');
    assert.throws(() => m.formatTaskTitle('D', 1, 'x'), /Invariant failed: formatTaskTitle/);
    assert.throws(() => m.formatTaskTitle('A', 10, 'x'), /Invariant failed: formatTaskTitle/);
  });

  test(`${label}: nextMonthKey refuses a key that would roll to NaN instead of returning "NaN-NaN"`, () => {
    assert.equal(m.nextMonthKey('2026-12'), '2027-01');
    assert.equal(m.nextMonthKey('2026-01'), '2026-02');
    assert.throws(() => m.nextMonthKey('garbage'), /Invariant failed: nextMonthKey/);
    assert.throws(() => m.nextMonthKey('2026-xx'), /Invariant failed: nextMonthKey/);
  });
}

test('server taskPlannerLocalDate still returns a YYYY-MM-DD key in a zone ahead of UTC', () => {
  assert.equal(taskPlannerLocalDate(new Date(Date.UTC(2026, 10, 15, 12, 0)), 'Pacific/Auckland'), '2026-11-16');
});
