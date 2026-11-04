/**
 * @file dailyDataCacheIdbRetry.test.js
 * @description A synchronous indexedDB.open() throw must not be cached: the next openDb() caller
 * reopens instead of reusing the failed (null) promise forever.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

console.error = () => {};
console.warn = () => {};
let opens = 0;
globalThis.indexedDB = {
  open() {
    opens += 1;
    if (opens === 1) throw new Error('SecurityError');
    const req = { error: new Error('second open failed') };
    queueMicrotask(() => req.onerror());
    return req;
  },
};
const cache = await import('../src/dailyDataCache.js');

describe('dailyDataCache open retry', () => {
  it('reopens after a synchronous open() throw', async () => {
    assert.equal(await cache.hydrateFromIdb('2026-01-01'), null);
    assert.equal(await cache.hydrateFromIdb('2026-01-02'), null);
    assert.equal(opens, 2);
  });
});
