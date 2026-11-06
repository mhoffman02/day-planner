/**
 * @file hubCache.test.js
 * @description src/hubCache.js: last Triage board, Doc rows and Meeting Prep kept in IndexedDB
 * (database day-planner-hub) so a fresh tab paints them at app start and refreshes in the background.
 * Pure record rules first, then the IndexedDB paths against a scripted fake indexedDB.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';

const errors = [];
const origError = console.error;
console.error = (...a) => { errors.push(a.join(' ')); };

let mode = 'works';
const rows = new Map();
const db = {
  onversionchange: null,
  objectStoreNames: { contains: () => false },
  createObjectStore() {},
  close() {},
  transaction() {
    const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
    tx.objectStore = () => ({
      put(entry) { rows.set(entry.key, entry); setImmediate(() => tx.oncomplete()); return {}; },
      delete(key) { rows.delete(key); setImmediate(() => tx.oncomplete()); return {}; },
      get(key) {
        const req = { result: undefined, error: null, onsuccess: null, onerror: null };
        setImmediate(() => { req.result = rows.get(key); req.onsuccess(); });
        return req;
      }
    });
    return tx;
  }
};
const opened = [];
globalThis.indexedDB = {
  open(name, version) {
    opened.push([name, version]);
    const req = { result: db, error: { name: 'AbortError', message: 'denied' }, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
    setImmediate(() => {
      if (mode === 'error') req.onerror();
      else { req.onupgradeneeded(); req.onsuccess(); }
    });
    return req;
  }
};

const {
  HUB_CACHE_MAX_AGE_MS, packHubCacheRecord, unpackHubCacheRecord, hubCachePut, hubCacheGet, hubCacheDelete
} = await import('../src/hubCache.js');

const NOW = Date.parse('2026-11-06T12:00:00Z');

describe('hub cache records', () => {
  it('round-trips a payload with its save time', () => {
    const rec = packHubCacheRecord({ rows: [1] }, NOW);
    assert.deepEqual(unpackHubCacheRecord(rec, NOW + 1000), { payload: { rows: [1] }, savedAt: NOW });
  });

  it('drops a record older than 7 days', () => {
    const rec = packHubCacheRecord({ a: 1 }, NOW);
    assert.equal(unpackHubCacheRecord(rec, NOW + HUB_CACHE_MAX_AGE_MS + 1), null);
    assert.notEqual(unpackHubCacheRecord(rec, NOW + HUB_CACHE_MAX_AGE_MS), null);
  });

  it('drops a wrong-schema record, a future save time and anything malformed', () => {
    const rec = packHubCacheRecord({ a: 1 }, NOW);
    assert.equal(unpackHubCacheRecord({ ...rec, schema: rec.schema + 1 }, NOW), null);
    assert.equal(unpackHubCacheRecord(rec, NOW - 60000 * 10), null, 'saved in the future');
    [null, undefined, 'x', 5, [], {}, { schema: rec.schema, savedAt: 'now', payload: {} }, { schema: rec.schema, savedAt: NOW }].forEach((bad) => {
      assert.equal(unpackHubCacheRecord(bad, NOW), null, JSON.stringify(bad));
    });
  });
});

describe('hub cache storage', () => {
  it('opens its own database, not the daily-data one', async () => {
    await hubCachePut('triageBoard', { queues: {} });
    assert.equal(opened[0][0], 'day-planner-hub');
  });

  it('stores, reads back and deletes a payload', async () => {
    assert.equal(await hubCachePut('docRows', { rows: [{ itemId: 'f~c' }] }), true);
    const got = await hubCacheGet('docRows');
    assert.deepEqual(got.payload, { rows: [{ itemId: 'f~c' }] });
    await hubCacheDelete('docRows');
    assert.equal(await hubCacheGet('docRows'), null);
  });

  it('a missing key reads as null', async () => {
    assert.equal(await hubCacheGet('nothing-here'), null);
  });

  it('a blocked IndexedDB reads as a miss and logs loudly, never throws', async () => {
    mode = 'error';
    const base = errors.length;
    // The working open is memoized; a fresh module instance simulates a new page load.
    const fresh = await import('../src/hubCache.js?blocked');
    assert.equal(await fresh.hubCacheGet('triageBoard'), null);
    assert.equal(await fresh.hubCachePut('triageBoard', { a: 1 }), false);
    assert.ok(errors.length > base, 'the failure is logged');
    console.error = origError;
  });
});
