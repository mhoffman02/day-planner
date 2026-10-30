// Property-based tests (fast-check): laws that must hold for every input, not just the cases someone
// thought of. On failure fast-check prints the seed and the smallest input that breaks the law.
// Targets are the date, month, quarter and task-title helpers, where boundary bugs (December,
// Q4, leap years, sequence 9) hide from hand-picked examples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { getLocalDateStr } from '../src/binderStore.js';
import { dayOfYearFromParts } from '../src/quotesEngine.js';
import {
  advanceQuarterKey, regressQuarterKey, nextMonthKey, generateRollingHorizon, quarterForMonth,
} from '../src/futureMatrixEngine.js';
import { parseTaskTitle, formatTaskTitle, getNextSequence } from '../src/taskEngine.js';
import { taskPlannerLocalDate } from '../src/integration/taskPlanner.js';

const pad = (n) => String(n).padStart(2, '0');
const year = fc.integer({ min: 1970, max: 2200 });
const month = fc.integer({ min: 1, max: 12 });
const quarter = fc.integer({ min: 1, max: 4 });
const localDate = fc.date({ min: new Date(1970, 0, 1), max: new Date(2200, 11, 31), noInvalidDate: true });
const group = fc.constantFrom('A', 'B', 'C');
const seq = fc.integer({ min: 1, max: 9 });
const title = fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0);

test('getLocalDateStr returns the local y-m-d of any Date', () => {
  fc.assert(fc.property(localDate, (d) => {
    assert.equal(getLocalDateStr(d), `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }));
});

test('getLocalDateStr is the identity on YYYY-MM-DD strings', () => {
  fc.assert(fc.property(localDate, (d) => {
    const s = getLocalDateStr(d);
    assert.equal(getLocalDateStr(s), s);
  }));
});

test('dayOfYearFromParts: Jan 1 is 1, each next local day adds 1, and Dec 31 is 365 or 366', () => {
  fc.assert(fc.property(localDate, (d) => {
    const [y, m, day] = [d.getFullYear(), d.getMonth() + 1, d.getDate()];
    const next = new Date(y, m - 1, day + 1);
    if (next.getFullYear() === y) {
      assert.equal(dayOfYearFromParts(y, next.getMonth() + 1, next.getDate()), dayOfYearFromParts(y, m, day) + 1);
    }
    const leap = new Date(y, 1, 29).getMonth() === 1;
    assert.equal(dayOfYearFromParts(y, 1, 1), 1);
    assert.equal(dayOfYearFromParts(y, 12, 31), leap ? 366 : 365);
  }));
});

test('taskPlannerLocalDate in UTC equals the UTC calendar date', () => {
  fc.assert(fc.property(localDate, (d) => {
    const utc = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    assert.equal(taskPlannerLocalDate(d, 'UTC'), utc);
  }));
});

test('advanceQuarterKey and regressQuarterKey are inverses, and four steps move one year', () => {
  fc.assert(fc.property(year, quarter, (y, q) => {
    const key = `${y}-Q${q}`;
    assert.equal(regressQuarterKey(advanceQuarterKey(key)), key);
    assert.equal(advanceQuarterKey(regressQuarterKey(key)), key);
    let k = key;
    for (let i = 0; i < 4; i++) k = advanceQuarterKey(k);
    assert.equal(k, `${y + 1}-Q${q}`);
  }));
});

test('nextMonthKey twelve times moves exactly one year', () => {
  fc.assert(fc.property(year, month, (y, m) => {
    let k = `${y}-${pad(m)}`;
    for (let i = 0; i < 12; i++) k = nextMonthKey(k);
    assert.equal(k, `${y + 1}-${pad(m)}`);
  }));
});

test('generateRollingHorizon is contiguous, indexed and quarter-consistent', () => {
  fc.assert(fc.property(year, month, fc.integer({ min: 0, max: 40 }), (y, m, len) => {
    const h = generateRollingHorizon(`${y}-${pad(m)}`, len);
    assert.equal(h.length, len);
    h.forEach((slot, i) => {
      assert.equal(slot.index, i);
      assert.equal(slot.quarter, quarterForMonth(slot.month));
      if (i > 0) assert.equal(slot.monthKey, nextMonthKey(h[i - 1].monthKey));
    });
  }));
});

test('parseTaskTitle inverts formatTaskTitle for every group, sequence 1-9 and title', () => {
  fc.assert(fc.property(group, seq, title, (g, s, t) => {
    const parsed = parseTaskTitle(formatTaskTitle(g, s, t));
    assert.equal(parsed.priorityGroup, g);
    assert.equal(parsed.sequence, s);
    assert.equal(parsed.cleanTitle, t.trim());
  }));
});

test('getNextSequence never reuses a taken sequence while one of 1-9 is free', () => {
  fc.assert(fc.property(group, fc.uniqueArray(seq, { maxLength: 8 }), (g, taken) => {
    const tasks = taken.map((s) => ({ title: `[${g}${s}] x` }));
    const next = getNextSequence(tasks, g);
    assert.ok(next >= 1 && next <= 9);
    assert.ok(!taken.includes(next), `returned taken sequence ${next}`);
  }));
});
