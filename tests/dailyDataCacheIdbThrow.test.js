/**
 * @file dailyDataCacheIdbThrow.test.js
 * @description indexedDB.open() throwing synchronously must log the stack and fall back to
 * memory-only instead of rejecting callers.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const errors = [];
console.error = (...a) => { errors.push(a.join(' ')); };
globalThis.indexedDB = { open() { throw new Error('SecurityError'); } };
const cache = await import('../src/dailyDataCache.js');

describe('dailyDataCache open throws', () => {
  it('logs the stack and degrades to memory-only', async () => {
    assert.equal(await cache.hydrateFromIdb('2026-01-01'), null);
    assert.ok(errors.some((e) => e.includes('IndexedDB open threw') && e.includes('SecurityError')));
    assert.equal(await cache.setCached('2026-01-02', { tasks: [] }), false);
    assert.equal(cache.getCached('2026-01-02').date, '2026-01-02');
  });
});
