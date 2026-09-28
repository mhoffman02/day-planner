/**
 * @file quotesEngine.test.js
 * @description Unit tests for deterministic quote-of-the-day lookup.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_QUOTE_ENTRIES,
  dayOfYearFromParts,
  getQuoteForDateStr
} from '../src/quotesEngine.js';

describe('Quotes Engine Unit Tests', () => {
  it('should compute day-of-year correctly across month boundaries', () => {
    assert.equal(dayOfYearFromParts(2026, 1, 1), 1);
    assert.equal(dayOfYearFromParts(2026, 1, 31), 31);
    assert.equal(dayOfYearFromParts(2026, 2, 1), 32);
    assert.equal(dayOfYearFromParts(2026, 12, 31), 365);
  });

  it('should account for leap years', () => {
    assert.equal(dayOfYearFromParts(2024, 12, 31), 366);
  });

  it('should return the same quote for the same date every time (deterministic)', () => {
    const a = getQuoteForDateStr('2026-09-28');
    const b = getQuoteForDateStr('2026-09-28');
    assert.deepEqual(a, b);
  });

  it('should return different quotes for different days within one cycle', () => {
    const a = getQuoteForDateStr('2026-01-01');
    const b = getQuoteForDateStr('2026-01-02');
    assert.notDeepEqual(a, b);
  });

  it('should never return an out-of-range entry', () => {
    for (let day = 1; day <= 366; day++) {
      const dateStr = day <= 31
        ? `2024-01-${String(day).padStart(2, '0')}`
        : '2024-12-31';
      const entry = getQuoteForDateStr(dateStr);
      assert.ok(ALL_QUOTE_ENTRIES.includes(entry));
      assert.ok(typeof entry.quote === 'string' && entry.quote.length > 0);
    }
  });

  it('should wrap around cleanly once day-of-year exceeds the entry count', () => {
    const cycleLength = ALL_QUOTE_ENTRIES.length;
    const first = ALL_QUOTE_ENTRIES[0];
    // day-of-year (cycleLength + 1) should land back on index 0
    const wrapDay = cycleLength + 1;
    const month = wrapDay <= 31 ? 1 : 2;
    const day = wrapDay <= 31 ? wrapDay : wrapDay - 31;
    const dateStr = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    assert.deepEqual(getQuoteForDateStr(dateStr), first);
  });
});
