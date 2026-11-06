/**
 * @file hubCache.js
 * @description Last Triage board, Doc rows and Meeting Prep kept in IndexedDB so a new tab paints them at
 * app start and the server answer replaces them in the background. Its own database (day-planner-hub), so
 * a schema bump here never blocks the daily-data database in another open tab. No user stamp: the web app
 * runs only for its owner (access MYSELF) and each deployment has its own storage origin. A blocked or
 * failing IndexedDB reads as a cache miss with a console error, never a thrown error: the app then loads
 * exactly as it did before this cache existed.
 */

const HUB_CACHE_DB = 'day-planner-hub';
const HUB_CACHE_DB_VERSION = 1;
const HUB_CACHE_STORE = 'entries';
const HUB_CACHE_SCHEMA = 1;
export const HUB_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const HUB_CACHE_OPEN_TIMEOUT_MS = 2000;
const HUB_CACHE_CLOCK_SKEW_MS = 5 * 60 * 1000;

let hubCacheDbPromise = null;

/**
 * @param {*} payload JSON-safe data to keep.
 * @param {number} nowMs Save time in epoch ms.
 * @returns {{schema: number, savedAt: number, payload: *}} The stored record.
 */
export function packHubCacheRecord(payload, nowMs) {
  return { schema: HUB_CACHE_SCHEMA, savedAt: nowMs, payload: JSON.parse(JSON.stringify(payload)) };
}

/**
 * @param {*} rec A stored record, or anything found under the key.
 * @param {number} nowMs Current time in epoch ms.
 * @returns {{payload: *, savedAt: number}|null} The data, or null when the record is the wrong shape or
 *   schema, older than 7 days, or saved in the future (a clock that moved).
 */
export function unpackHubCacheRecord(rec, nowMs) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null;
  if (rec.schema !== HUB_CACHE_SCHEMA || typeof rec.savedAt !== 'number' || !('payload' in rec) || rec.payload === undefined) return null;
  if (rec.savedAt > nowMs + HUB_CACHE_CLOCK_SKEW_MS) return null;
  if (nowMs - rec.savedAt > HUB_CACHE_MAX_AGE_MS) return null;
  return { payload: rec.payload, savedAt: rec.savedAt };
}

function hubCacheOpen() {
  if (hubCacheDbPromise) return hubCacheDbPromise;
  hubCacheDbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (db, why, err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!db) {
        console.error('[hubCache] IndexedDB unavailable (' + why + '), the hub loads from the server only this session:', err && err.stack ? err.stack : err);
        hubCacheDbPromise = null;
      }
      resolve(db);
    };
    const timer = setTimeout(() => finish(null, 'open timed out after ' + HUB_CACHE_OPEN_TIMEOUT_MS + ' ms', null), HUB_CACHE_OPEN_TIMEOUT_MS);
    try {
      const req = indexedDB.open(HUB_CACHE_DB, HUB_CACHE_DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(HUB_CACHE_STORE)) req.result.createObjectStore(HUB_CACHE_STORE, { keyPath: 'key' });
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => { req.result.close(); };
        finish(req.result, '', null);
      };
      req.onerror = () => finish(null, 'open failed', req.error);
      req.onblocked = () => finish(null, 'open blocked by another tab', null);
    } catch (err) {
      console.error('[hubCache] indexedDB.open threw:', err.stack);
      finish(null, 'open threw', null);
    }
  });
  return hubCacheDbPromise;
}

/**
 * @param {string} key Entry name, for example triageBoard.
 * @param {*} payload JSON-safe data.
 * @returns {Promise<boolean>} True when committed; false when IndexedDB is unavailable or the write failed (logged).
 */
export function hubCachePut(key, payload) {
  return hubCacheOpen().then((db) => {
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(HUB_CACHE_STORE, 'readwrite');
        tx.oncomplete = () => resolve(true);
        const fail = () => {
          console.error('[hubCache] write of ' + key + ' failed, the next page load waits for the server:', tx.error);
          resolve(false);
        };
        tx.onerror = fail;
        tx.onabort = fail;
        tx.objectStore(HUB_CACHE_STORE).put({ key, ...packHubCacheRecord(payload, Date.now()) });
      } catch (err) {
        console.error('[hubCache] write of ' + key + ' threw, the next page load waits for the server:', err.stack);
        resolve(false);
      }
    });
  });
}

/**
 * @param {string} key Entry name.
 * @returns {Promise<{payload: *, savedAt: number}|null>} The saved data, or null on a miss, an expired or
 *   malformed record, or an unavailable IndexedDB.
 */
export function hubCacheGet(key) {
  return hubCacheOpen().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(HUB_CACHE_STORE, 'readonly').objectStore(HUB_CACHE_STORE).get(key);
        req.onsuccess = () => resolve(unpackHubCacheRecord(req.result, Date.now()));
        req.onerror = () => {
          console.error('[hubCache] read of ' + key + ' failed, treating it as a miss:', req.error);
          resolve(null);
        };
      } catch (err) {
        console.error('[hubCache] read of ' + key + ' threw, treating it as a miss:', err.stack);
        resolve(null);
      }
    });
  });
}

/**
 * @param {string} key Entry name.
 * @returns {Promise<boolean>} True when removed; false when IndexedDB is unavailable or the delete failed (logged).
 */
export function hubCacheDelete(key) {
  return hubCacheOpen().then((db) => {
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(HUB_CACHE_STORE, 'readwrite');
        tx.oncomplete = () => resolve(true);
        const fail = () => {
          console.error('[hubCache] delete of ' + key + ' failed, a stale copy may reappear next load:', tx.error);
          resolve(false);
        };
        tx.onerror = fail;
        tx.onabort = fail;
        tx.objectStore(HUB_CACHE_STORE).delete(key);
      } catch (err) {
        console.error('[hubCache] delete of ' + key + ' threw, a stale copy may reappear next load:', err.stack);
        resolve(false);
      }
    });
  });
}
