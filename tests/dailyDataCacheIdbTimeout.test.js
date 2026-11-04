/**
 * @file dailyDataCacheIdbTimeout.test.js
 * @description An indexedDB.open() that never fires any callback must not hang callers: after
 * the 2000ms bound the cache warns and falls back to memory-only (null hydrate, persist false).
 */
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const warns = [];
console.warn = (...a) => { warns.push(a.join(' ')); };
globalThis.indexedDB = { open: () => ({ result: null }) };
const cache = await import('../src/dailyDataCache.js');

describe('dailyDataCache open timeout', () => {
  it('resolves memory-only after 2000ms when open never settles', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const p = cache.hydrateFromIdb('2026-01-01');
    await Promise.resolve();
    mock.timers.tick(1999);
    assert.equal(warns.length, 0);
    mock.timers.tick(1);
    assert.equal(await p, null);
    mock.timers.reset();
    assert.equal(warns.length, 1);
    assert.match(warns[0], /timed out after 2000ms/);
    assert.equal(await cache.setCached('2026-01-02', { tasks: [] }), false);
  });
});
