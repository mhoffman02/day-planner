/**
 * @file futureMatrixEngine.test.js
 * @description Unit tests for the Future Planning Matrix (12-month overview) engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MONTH_KEYS,
  monthKeyFor,
  createFutureItem,
  nextMonthKey,
  emptyYearMatrix
} from '../src/futureMatrixEngine.js';

describe('Future Matrix Engine Unit Tests', () => {
  it('should expose 12 zero-padded month keys in order', () => {
    assert.equal(MONTH_KEYS.length, 12);
    assert.equal(MONTH_KEYS[0], '01');
    assert.equal(MONTH_KEYS[11], '12');
  });

  it('should build a YYYY-MM month key', () => {
    assert.equal(monthKeyFor(2026, 3), '2026-03');
    assert.equal(monthKeyFor(2026, 12), '2026-12');
  });

  it('should create a future item with default open status', () => {
    const item = createFutureItem('Book venue for June offsite', 'Work');
    assert.equal(item.title, 'Book venue for June offsite');
    assert.equal(item.category, 'Work');
    assert.equal(item.status, '•');
    assert.ok(item.id.startsWith('fm_'));
    assert.ok(item.createdAt);
  });

  it('should default category to General when omitted', () => {
    const item = createFutureItem('Renew passport');
    assert.equal(item.category, 'General');
  });

  it('should compute the next month key within the same year', () => {
    assert.equal(nextMonthKey('2026-03'), '2026-04');
  });

  it('should roll over into the next year after December', () => {
    assert.equal(nextMonthKey('2026-12'), '2027-01');
  });

  it('should build an empty 12-month matrix with every month pre-seeded', () => {
    const matrix = emptyYearMatrix(2026);
    assert.equal(matrix.year, '2026');
    assert.equal(Object.keys(matrix.months).length, 12);
    assert.deepEqual(matrix.months['2026-01'], []);
    assert.deepEqual(matrix.months['2026-12'], []);
  });
});
