/**
 * @file dailyDataCacheIdbErrors.test.js
 * @description IndexedDB write/read failures in the daily data cache must be loud. A quota or
 * constraint failure arrives asynchronously as a transaction error/abort event -- never through
 * the synchronous try around db.transaction() -- so without tx.onerror/onabort handlers it was
 * invisible: the memory cache looked persisted while the next session silently lost it.
 * Runs against both src/dailyDataCache.js and its dp* mirror inside gas-app/Script.html.
 * A fake indexedDB is installed BEFORE the module is imported (openDb memoizes its first probe),
 * which is why this lives in its own test file / process.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScriptHtml, settle, captureConsoleError } from './helpers/plannerHarness.js';

function makeFakeIdb() {
  const txs = [];
  const db = {
    objectStoreNames: { contains: () => true },
    onversionchange: null,
    close: () => {},
    transaction(storeName, mode) {
      const tx = { storeName, mode, error: null, oncomplete: null, onerror: null, onabort: null, requests: [] };
      const mkReq = () => { const r = { result: undefined, error: null, onsuccess: null, onerror: null }; tx.requests.push(r); return r; };
      tx.objectStore = () => ({ put: mkReq, delete: mkReq, get: mkReq });
      txs.push(tx);
      return tx;
    }
  };
  const idb = {
    open() {
      const req = { result: db, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      setImmediate(() => { if (req.onsuccess) req.onsuccess(); });
      return req;
    }
  };
  return { idb, txs };
}

function abortWithQuota(tx) {
  tx.error = { name: 'QuotaExceededError', message: 'The quota has been exceeded.' };
  if (tx.onerror) tx.onerror({ target: tx });
  if (tx.onabort) tx.onabort({ target: tx });
}

const fakeSrc = makeFakeIdb();
globalThis.indexedDB = fakeSrc.idb;
const srcCache = await import('../src/dailyDataCache.js');

const fakeGas = makeFakeIdb();
const gas = loadScriptHtml({
  indexedDB: fakeGas.idb,
  // Real timers: the immediate-timer default would fire the 2000ms IDB open timeout first.
  timers: { setTimeout, clearTimeout },
  exportNames: ['dpSetCached', 'dpInvalidateCached', 'dpSetCachedMasterTasks', 'dpSetCachedFutureMatrix', 'dpSaveNoteRevision', 'dpHydrateFromIdb']
});

const impls = [
  {
    label: 'src/dailyDataCache.js',
    fake: fakeSrc,
    setCached: srcCache.setCached,
    invalidateCached: srcCache.invalidateCached,
    setCachedMasterTasks: srcCache.setCachedMasterTasks,
    setCachedFutureMatrix: srcCache.setCachedFutureMatrix,
    saveNoteRevision: srcCache.saveNoteRevision,
    hydrateFromIdb: srcCache.hydrateFromIdb,
    reset: srcCache.clearMemoryCache
  },
  {
    label: 'gas-app/Script.html',
    fake: fakeGas,
    setCached: gas.scope.dpSetCached,
    invalidateCached: gas.scope.dpInvalidateCached,
    setCachedMasterTasks: gas.scope.dpSetCachedMasterTasks,
    setCachedFutureMatrix: gas.scope.dpSetCachedFutureMatrix,
    saveNoteRevision: gas.scope.dpSaveNoteRevision,
    hydrateFromIdb: gas.scope.dpHydrateFromIdb,
    reset: () => {}
  }
];

for (const impl of impls) {
  describe(`IndexedDB failures are loud [${impl.label}]`, () => {
    const writes = [
      ['setCached', () => impl.setCached('2026-10-09', { tasks: [], calendarEvents: [], noteContent: 'x', docUrl: '' })],
      ['invalidateCached', () => impl.invalidateCached('2026-10-09')],
      ['setCachedMasterTasks', () => impl.setCachedMasterTasks([{ id: 'm1' }])],
      ['setCachedFutureMatrix', () => impl.setCachedFutureMatrix(2026, { year: 2026, months: {} })]
    ];

    for (const [name, write] of writes) {
      it(`${name}: a transaction abort (quota) rejects the returned promise and logs the error`, async () => {
        const before = impl.fake.txs.length;
        let result;
        const logs = await captureConsoleError(async () => {
          result = write();
          await settle();
          const tx = impl.fake.txs[before];
          assert.ok(tx, 'a readwrite transaction was opened');
          abortWithQuota(tx);
          await assert.rejects(Promise.resolve(result), /QuotaExceededError/);
          await settle();
        });
        assert.ok(result && typeof result.then === 'function', `${name} returns a promise`);
        assert.ok(logs.some((l) => l.includes('QuotaExceededError')), 'console.error names the failure');
      });
    }

    it('setCached resolves once the transaction completes', async () => {
      const before = impl.fake.txs.length;
      const p = impl.setCached('2026-10-10', { tasks: [], calendarEvents: [], noteContent: 'y', docUrl: '' });
      await settle();
      impl.fake.txs[before].oncomplete();
      assert.equal(await p, true);
    });

    it('saveNoteRevision logs a quota abort on its revision write', async () => {
      const before = impl.fake.txs.length;
      const logs = await captureConsoleError(async () => {
        const revs = impl.saveNoteRevision('2026-10-09', 'note text ' + impl.label);
        assert.ok(Array.isArray(revs), 'still returns the in-memory revision list');
        await settle();
        abortWithQuota(impl.fake.txs[before]);
        await settle();
      });
      assert.ok(logs.some((l) => l.includes('QuotaExceededError')));
    });

    it('hydrateFromIdb logs a failed IDB get instead of silently reporting a cache miss', async () => {
      impl.reset();
      const before = impl.fake.txs.length;
      let p;
      const logs = await captureConsoleError(async () => {
        p = impl.hydrateFromIdb('2026-01-01');
        await settle();
        const req = impl.fake.txs[before].requests[0];
        req.error = { name: 'UnknownError', message: 'disk I/O' };
        req.onerror();
        await p;
      });
      assert.equal(await p, null);
      assert.ok(logs.some((l) => l.includes('UnknownError') || l.includes('disk I/O')));
    });
  });
}
