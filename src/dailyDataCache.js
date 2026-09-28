/**
 * @file dailyDataCache.js
 * @description In-memory + IndexedDB cache for per-day planner data (tasks, calendar events,
 * notes), keyed by YYYY-MM-DD. Backs fast day-by-day navigation: a memory-first Map gives
 * instant reads within a session; IndexedDB persists entries across reloads when available,
 * probed once lazily and falling back to memory-only (loud console warning, not a thrown error)
 * if IDB is blocked -- e.g. inside a locked-down/.gov iframe where third-party storage may be
 * disabled. The ±N-day navigation speedup this backs must not depend on IDB succeeding.
 */

const DB_NAME = 'day-planner-cache';
const DB_VERSION = 1;
const STORE_NAME = 'dailyData';
const IDB_OPEN_TIMEOUT_MS = 2000;

let memoryCache = new Map();
let dbPromise = null;

function cloneForStorage(value) {
  // Structured-clone-safe copy: strips Alpine/Vue Proxy wrappers and any non-cloneable fields
  // (functions, etc.) that would otherwise throw DataCloneError on an IndexedDB put.
  return JSON.parse(JSON.stringify(value));
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    // A sandboxed third-party context (e.g. this app's own Apps Script googleusercontent
    // iframe on a locked-down network) can silently never fire either onsuccess or onerror on
    // indexedDB.open -- confirmed live: the request just hangs. Without a bound, every future
    // openDb() caller would await a promise that never settles. Fail open loudly instead.
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn('[dailyDataCache] IndexedDB open timed out after ' + IDB_OPEN_TIMEOUT_MS + 'ms (likely blocked in this iframe/context); falling back to memory-only cache for this session.');
      resolve(null);
    }, IDB_OPEN_TIMEOUT_MS);

    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'date' });
        }
      };
      req.onsuccess = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        const db = req.result;
        // Another tab/version upgraded the schema out from under this open connection -- close
        // it so that upgrade isn't blocked, rather than hanging cross-tab (see commit a1a85f1).
        db.onversionchange = () => { db.close(); };
        resolve(db);
      };
      req.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        console.warn('[dailyDataCache] IndexedDB open failed, falling back to memory-only cache for this session:', req.error);
        resolve(null);
      };
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        console.warn('[dailyDataCache] IndexedDB open threw, falling back to memory-only cache for this session:', err);
        resolve(null);
      }
    }
  });
  return dbPromise;
}

/** @returns {object|null} The cached entry for dateStr, or null if not present (memory only). */
export function getCached(dateStr) {
  return memoryCache.get(dateStr) || null;
}

/**
 * Writes an entry into the memory cache immediately (synchronous) and persists it to IndexedDB
 * in the background (best-effort, never blocks the caller).
 * @param {string} dateStr YYYY-MM-DD key.
 * @param {object} data Daily payload (tasks/calendarEvents/noteContent/docUrl, etc.).
 */
export function setCached(dateStr, data) {
  const entry = cloneForStorage({ ...data, date: dateStr });
  memoryCache.set(dateStr, entry);
  openDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(entry);
    } catch (err) {
      console.warn('[dailyDataCache] IDB put failed for', dateStr, err);
    }
  });
}

/** Removes dateStr from both the memory cache and IndexedDB. */
export function invalidateCached(dateStr) {
  memoryCache.delete(dateStr);
  openDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(dateStr);
    } catch (err) {
      console.warn('[dailyDataCache] IDB delete failed for', dateStr, err);
    }
  });
}

/**
 * Loads a single date from IndexedDB into the memory cache on demand (used to check for a
 * persisted entry from a prior session before falling back to a live fetch).
 * @param {string} dateStr YYYY-MM-DD key.
 * @returns {Promise<object|null>} The hydrated entry, or null if not persisted / IDB unavailable.
 */
export async function hydrateFromIdb(dateStr) {
  if (memoryCache.has(dateStr)) return memoryCache.get(dateStr);
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(dateStr);
      req.onsuccess = () => {
        const entry = req.result || null;
        if (entry) memoryCache.set(dateStr, entry);
        resolve(entry);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Bulk-primes the cache from a getDailyDataRange() response, e.g. a background ±N-day
 * prefetch. Only fills dates NOT already in the memory cache -- a prefetch must never clobber a
 * fresher foreground load or a just-written local edit for the same date (both write through
 * via setCached before any prefetch could land).
 * @param {Object<string, object>} days Map of dateStr -> daily payload, as returned by
 *   getDailyDataRange's `days` field.
 */
export function primeFromRange(days) {
  Object.keys(days || {}).forEach((dateStr) => {
    if (memoryCache.has(dateStr)) return;
    const entry = days[dateStr];
    if (!entry || entry.noteContent === null) return; // no real data fetched for this date yet
    setCached(dateStr, entry);
  });
}

/** Clears the in-memory cache only (does not touch IndexedDB). Test/reset use only. */
export function clearMemoryCache() {
  memoryCache = new Map();
}
