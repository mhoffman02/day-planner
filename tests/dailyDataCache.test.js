/**
 * @file dailyDataCache.test.js
 * @description Unit tests for the memory-first daily data cache. IndexedDB is unavailable in
 * the node test runner (typeof indexedDB === 'undefined'), which exercises exactly the
 * memory-only fallback path this module must degrade to gracefully on a locked-down browser.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCached,
  setCached,
  invalidateCached,
  hydrateFromIdb,
  primeFromRange,
  clearMemoryCache
} from '../src/dailyDataCache.js';

describe('Daily Data Cache Unit Tests', () => {
  beforeEach(() => {
    clearMemoryCache();
  });

  it('should return null for an uncached date', () => {
    assert.equal(getCached('2026-09-25'), null);
  });

  it('should store and retrieve an entry by date', () => {
    setCached('2026-09-25', { tasks: [{ id: 't1' }], calendarEvents: [], noteContent: 'hi', docUrl: '#' });
    const cached = getCached('2026-09-25');
    assert.equal(cached.date, '2026-09-25');
    assert.deepEqual(cached.tasks, [{ id: 't1' }]);
    assert.equal(cached.noteContent, 'hi');
  });

  it('should deep-clone stored data so later mutation of the source object does not affect the cache', () => {
    const source = { tasks: [{ id: 't1', starred: false }], calendarEvents: [], noteContent: 'x', docUrl: '#' };
    setCached('2026-09-25', source);
    source.tasks[0].starred = true;
    assert.equal(getCached('2026-09-25').tasks[0].starred, false);
  });

  it('should overwrite an existing entry on re-set (write-through on edit)', () => {
    setCached('2026-09-25', { tasks: [], calendarEvents: [], noteContent: 'first draft', docUrl: '#' });
    setCached('2026-09-25', { tasks: [], calendarEvents: [], noteContent: 'edited draft', docUrl: '#' });
    assert.equal(getCached('2026-09-25').noteContent, 'edited draft');
  });

  it('should remove an entry on invalidate', () => {
    setCached('2026-09-25', { tasks: [], calendarEvents: [], noteContent: 'x', docUrl: '#' });
    invalidateCached('2026-09-25');
    assert.equal(getCached('2026-09-25'), null);
  });

  it('should resolve null from hydrateFromIdb when IndexedDB is unavailable (memory-only fallback)', async () => {
    const result = await hydrateFromIdb('2026-09-25');
    assert.equal(result, null);
  });

  it('should return the already-cached entry from hydrateFromIdb without touching IndexedDB', async () => {
    setCached('2026-09-25', { tasks: [], calendarEvents: [], noteContent: 'x', docUrl: '#' });
    const result = await hydrateFromIdb('2026-09-25');
    assert.equal(result.noteContent, 'x');
  });

  it('primeFromRange should fill only dates not already cached', () => {
    setCached('2026-09-25', { tasks: [], calendarEvents: [], noteContent: 'kept', docUrl: '#' });
    primeFromRange({
      '2026-09-25': { tasks: [], calendarEvents: [], noteContent: 'overwritten?', docUrl: '#' },
      '2026-09-26': { tasks: [], calendarEvents: [], noteContent: 'new', docUrl: '#' }
    });
    assert.equal(getCached('2026-09-25').noteContent, 'kept', 'must not clobber an already-cached date');
    assert.equal(getCached('2026-09-26').noteContent, 'new');
  });

  it('primeFromRange should skip a range day with no real data (noteContent === null, e.g. an unwritten doc)', () => {
    primeFromRange({
      '2026-09-27': { tasks: [], calendarEvents: [], noteContent: null, docUrl: '' }
    });
    assert.equal(getCached('2026-09-27'), null);
  });
});
