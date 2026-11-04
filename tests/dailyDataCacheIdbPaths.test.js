/**
 * @file dailyDataCacheIdbPaths.test.js
 * @description IndexedDB open/upgrade/hydrate paths of src/dailyDataCache.js against a scripted
 * fake indexedDB. openDb memoizes its result, so scenarios run in order inside one process:
 * open-error and blocked (both reset the memo for retry), then a working DB.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const warns = [];
const errors = [];
const origWarn = console.warn;
const origError = console.error;
console.warn = (...a) => { warns.push(a.join(' ')); };
console.error = (...a) => { errors.push(a.join(' ')); };

let mode = 'error';
const stores = { dailyData: new Map(), masterTasks: new Map(), futureMatrix: new Map(), noteRevisions: new Map() };
const created = [];
let getFails = false;
let getThrows = false;
let closed = false;

const db = {
  objectStoreNames: { contains: () => false },
  onversionchange: null,
  close() { closed = true; },
  createObjectStore(name, opts) { created.push(name + ':' + opts.keyPath); },
  transaction(storeName) {
    if (getThrows) throw new Error('tx closed');
    const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
    tx.objectStore = () => ({
      put(entry) {
        stores[storeName].set(entry.date || entry.key || entry.year, entry);
        setImmediate(() => { if (tx.oncomplete) tx.oncomplete(); });
        return {};
      },
      get(key) {
        const req = { result: undefined, error: { name: 'ReadError', message: 'boom' }, onsuccess: null, onerror: null };
        setImmediate(() => {
          if (getFails) { req.onerror(); return; }
          req.result = stores[storeName].get(key);
          req.onsuccess();
        });
        return req;
      }
    });
    return tx;
  }
};

globalThis.indexedDB = {
  open() {
    const req = { result: db, error: { name: 'AbortError', message: 'denied' }, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
    setImmediate(() => {
      if (mode === 'error') req.onerror();
      else if (mode === 'blocked') req.onblocked();
      else { req.onupgradeneeded(); req.onsuccess(); }
    });
    return req;
  }
};

const cache = await import('../src/dailyDataCache.js');

describe('dailyDataCache IndexedDB paths', () => {
  it('open error warns with the error name and allows a retry', async () => {
    mode = 'error';
    assert.deepEqual(await cache.hydrateNoteRevisionsFromIdb('2026-01-01'), []);
    assert.ok(warns.some((w) => w.includes('open failed') && w.includes('AbortError: denied')));
  });

  it('blocked open falls back to memory-only and allows a retry', async () => {
    mode = 'blocked';
    assert.equal(await cache.hydrateMasterTasksFromIdb(), null);
    assert.ok(warns.some((w) => w.includes('blocked by another open tab')));
  });

  it('working DB: creates all four stores with their key paths and closes on versionchange', async () => {
    mode = 'ok';
    assert.equal(await cache.setCached('2026-02-02', { tasks: [] }), true);
    assert.deepEqual(created, ['dailyData:date', 'masterTasks:key', 'futureMatrix:year', 'noteRevisions:date']);
    db.onversionchange();
    assert.equal(closed, true);
  });

  it('hydrates a daily entry persisted by a prior session into memory', async () => {
    stores.dailyData.set('2026-03-03', { date: '2026-03-03', tasks: [{ id: 'a' }] });
    const entry = await cache.hydrateFromIdb('2026-03-03');
    assert.deepEqual(entry.tasks, [{ id: 'a' }]);
    assert.equal(cache.getCached('2026-03-03'), entry);
    assert.equal(await cache.hydrateFromIdb('2026-03-04'), null);
  });

  it('hydrates master tasks and future matrix from IDB, null when absent', async () => {
    assert.equal(await cache.hydrateMasterTasksFromIdb(), null);
    stores.masterTasks.set('all', { key: 'all', tasks: [{ id: 'm' }] });
    const mt = await cache.hydrateMasterTasksFromIdb();
    assert.deepEqual(mt.tasks, [{ id: 'm' }]);
    assert.equal(cache.getCachedMasterTasks(), mt);

    assert.equal(await cache.hydrateFutureMatrixFromIdb(2030), null);
    stores.futureMatrix.set('2031', { year: '2031', months: [1] });
    const fm = await cache.hydrateFutureMatrixFromIdb(2031);
    assert.deepEqual(fm.months, [1]);
    assert.equal(cache.getCachedFutureMatrix(2031), fm);
  });

  it('hydrates note revisions from IDB; ignores non-array revisions', async () => {
    stores.noteRevisions.set('2026-04-04', { date: '2026-04-04', revisions: [{ noteContent: 'x' }] });
    assert.deepEqual(await cache.hydrateNoteRevisionsFromIdb('2026-04-04'), [{ noteContent: 'x' }]);
    assert.deepEqual(cache.getNoteRevisions('2026-04-04'), [{ noteContent: 'x' }]);
    stores.noteRevisions.set('2026-04-05', { date: '2026-04-05', revisions: 'bad' });
    assert.deepEqual(await cache.hydrateNoteRevisionsFromIdb('2026-04-05'), []);
    assert.deepEqual(cache.getNoteRevisions('2026-04-05'), []);
  });

  it('get request errors log and resolve to the not-cached value', async () => {
    cache.clearMemoryCache();
    getFails = true;
    errors.length = 0;
    assert.equal(await cache.hydrateFromIdb('2026-05-01'), null);
    assert.equal(await cache.hydrateFutureMatrixFromIdb(2040), null);
    assert.equal(await cache.hydrateMasterTasksFromIdb(), null);
    assert.deepEqual(await cache.hydrateNoteRevisionsFromIdb('2026-05-01'), []);
    assert.equal(errors.filter((e) => e.includes('IDB get failed') && e.includes('ReadError: boom')).length, 4);
    getFails = false;
  });

  it('synchronous transaction throws log the stack and resolve to the not-cached value', async () => {
    cache.clearMemoryCache();
    getThrows = true;
    errors.length = 0;
    assert.equal(await cache.hydrateFromIdb('2026-06-01'), null);
    assert.equal(await cache.hydrateMasterTasksFromIdb(), null);
    assert.equal(await cache.hydrateFutureMatrixFromIdb(2041), null);
    assert.deepEqual(await cache.hydrateNoteRevisionsFromIdb('2026-06-01'), []);
    assert.equal(errors.filter((e) => e.includes('IDB read threw') && e.includes('tx closed')).length, 4);
    getThrows = false;
    console.warn = origWarn;
    console.error = origError;
  });
});
