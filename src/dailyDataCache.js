/**
 * @file dailyDataCache.js
 * @description In-memory + IndexedDB cache backing every tab's data: per-day planner data
 * (tasks, calendar events, notes) keyed by YYYY-MM-DD, Master Tasks (one global list), and the
 * Future Planning matrix (keyed by year). A memory-first Map per store gives instant reads
 * within a session; IndexedDB persists entries across reloads when available, probed once
 * lazily and falling back to memory-only (loud console warning, not a thrown error) if IDB is
 * blocked -- e.g. inside a locked-down/.gov iframe where third-party storage may be disabled.
 * No tab's speedup here may depend on IDB succeeding.
 *
 * The Monthly Calendar tab deliberately has no separate store: its data is just every day in
 * the visible month, so it reads the same per-date dailyData entries this module already keyed
 * and protects (edit-seq guard, prime-never-clobbers), via getDailyDataRange for the whole
 * month instead of a dedicated monthOverview store duplicating the same rows.
 */

const DB_NAME = 'day-planner-cache';
const DB_VERSION = 2;
const STORE_DAILY = 'dailyData';
const STORE_MASTER_TASKS = 'masterTasks';
const STORE_FUTURE_MATRIX = 'futureMatrix';
const MASTER_TASKS_KEY = 'all';
const IDB_OPEN_TIMEOUT_MS = 2000;

let dailyMemory = new Map();
let masterTasksMemory = null;
let futureMatrixMemory = new Map();
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

    // A single open() call inside this app's own Apps Script googleusercontent iframe was
    // observed once to never fire either onsuccess or onerror (root cause unconfirmed -- could
    // be iframe storage partitioning, could be something else entirely). Not reproduced since,
    // but the failure mode -- neither callback ever firing -- is cheap to guard against
    // regardless of cause: without a bound, every future openDb() caller would await a promise
    // that never settles. Fail open loudly instead.
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
        if (!db.objectStoreNames.contains(STORE_DAILY)) {
          db.createObjectStore(STORE_DAILY, { keyPath: 'date' });
        }
        if (!db.objectStoreNames.contains(STORE_MASTER_TASKS)) {
          db.createObjectStore(STORE_MASTER_TASKS, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_FUTURE_MATRIX)) {
          db.createObjectStore(STORE_FUTURE_MATRIX, { keyPath: 'year' });
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
        dbPromise = null; // allow a later retry instead of caching this failure forever
        resolve(null);
      };
      // Another tab holds an open connection at an older DB_VERSION -- this open() sits pending
      // with no onsuccess/onupgradeneeded/onerror, which without this handler means every caller
      // awaiting openDb() hangs silently forever instead of falling back to memory-only.
      req.onblocked = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        console.warn('[dailyDataCache] IndexedDB open blocked by another open tab/connection at an older version; falling back to memory-only cache for this session.');
        dbPromise = null;
        resolve(null);
      };
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        console.warn('[dailyDataCache] IndexedDB open threw, falling back to memory-only cache for this session:', err);
        dbPromise = null;
        resolve(null);
      }
    }
  });
  return dbPromise;
}

// ── Daily data (per-date: tasks, calendarEvents, noteContent, docUrl) ───────────────────────

/** @returns {object|null} The cached entry for dateStr, or null if not present (memory only). */
export function getCached(dateStr) {
  return dailyMemory.get(dateStr) || null;
}

/**
 * Writes an entry into the memory cache immediately (synchronous) and persists it to IndexedDB
 * in the background (best-effort, never blocks the caller).
 * @param {string} dateStr YYYY-MM-DD key.
 * @param {object} data Daily payload (tasks/calendarEvents/noteContent/docUrl, etc.).
 */
export function setCached(dateStr, data) {
  const entry = cloneForStorage({ ...data, date: dateStr });
  dailyMemory.set(dateStr, entry);
  openDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_DAILY, 'readwrite');
      tx.objectStore(STORE_DAILY).put(entry);
    } catch (err) {
      console.warn('[dailyDataCache] IDB put failed for', dateStr, err);
    }
  });
}

/** Removes dateStr from both the memory cache and IndexedDB. */
export function invalidateCached(dateStr) {
  dailyMemory.delete(dateStr);
  openDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_DAILY, 'readwrite');
      tx.objectStore(STORE_DAILY).delete(dateStr);
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
  if (dailyMemory.has(dateStr)) return dailyMemory.get(dateStr);
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_DAILY, 'readonly');
      const req = tx.objectStore(STORE_DAILY).get(dateStr);
      req.onsuccess = () => {
        const entry = req.result || null;
        if (entry) dailyMemory.set(dateStr, entry);
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
 * prefetch or a Monthly Calendar month load. Only fills dates NOT already in the memory cache --
 * a prefetch must never clobber a fresher foreground load or a just-written local edit for the
 * same date (both write through via setCached before any prefetch could land).
 *
 * `entry.noteContent === null` only means "no note section exists for this date yet" (a common,
 * legitimate case for most future/blank days) -- it does NOT mean nothing was fetched. tasks and
 * calendarEvents are always real for every date in the response. Caching only the entries with a
 * note previously meant every note-less day in the window was never marked cached, so the range
 * RPC re-fired on every navigation instead of being skipped once the window was already primed.
 * @param {Object<string, object>} days Map of dateStr -> daily payload, as returned by
 *   getDailyDataRange's `days` field.
 */
export function primeFromRange(days) {
  Object.keys(days || {}).forEach((dateStr) => {
    if (dailyMemory.has(dateStr)) return;
    const entry = days[dateStr];
    if (!entry) return;
    setCached(dateStr, entry);
  });
}

/**
 * Reads every already-cached day (memory only, no IDB round trip) within [startDateStr,
 * endDateStr] inclusive -- used by the Monthly Calendar grid to render instantly from whatever
 * of the visible month is already primed, without waiting on a live fetch.
 * @param {string} startDateStr Range start (inclusive), YYYY-MM-DD.
 * @param {string} endDateStr Range end (inclusive), YYYY-MM-DD.
 * @returns {Object<string, object>} Map of dateStr -> cached entry, for whichever dates in the
 *   range are already cached (missing dates are simply absent, not null-filled).
 */
export function getCachedRange(startDateStr, endDateStr) {
  const out = {};
  dailyMemory.forEach((entry, dateStr) => {
    if (dateStr >= startDateStr && dateStr <= endDateStr) out[dateStr] = entry;
  });
  return out;
}

// ── Master Tasks (one global list, independent of any month) ────────────────────────────────

/** @returns {object|null} The cached master-tasks entry ({ tasks, cachedAt }), or null. */
export function getCachedMasterTasks() {
  return masterTasksMemory;
}

/**
 * @param {Array<object>} tasks Master task clearinghouse list to cache.
 */
export function setCachedMasterTasks(tasks) {
  const entry = cloneForStorage({ key: MASTER_TASKS_KEY, tasks, cachedAt: new Date().toISOString() });
  masterTasksMemory = entry;
  openDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_MASTER_TASKS, 'readwrite');
      tx.objectStore(STORE_MASTER_TASKS).put(entry);
    } catch (err) {
      console.warn('[dailyDataCache] IDB put failed for masterTasks', err);
    }
  });
}

/** @returns {Promise<object|null>} The hydrated master-tasks entry, or null if not persisted. */
export async function hydrateMasterTasksFromIdb() {
  if (masterTasksMemory) return masterTasksMemory;
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_MASTER_TASKS, 'readonly');
      const req = tx.objectStore(STORE_MASTER_TASKS).get(MASTER_TASKS_KEY);
      req.onsuccess = () => {
        const entry = req.result || null;
        if (entry) masterTasksMemory = entry;
        resolve(entry);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// ── Future Planning matrix (keyed by year) ───────────────────────────────────────────────────

/** @param {number|string} year Target year. @returns {object|null} The cached matrix, or null. */
export function getCachedFutureMatrix(year) {
  return futureMatrixMemory.get(String(year)) || null;
}

/**
 * @param {number|string} year Target year.
 * @param {object} matrix Future matrix payload ({ year, months }) as returned by getFutureMatrix.
 */
export function setCachedFutureMatrix(year, matrix) {
  const yearKey = String(year);
  const entry = cloneForStorage({ ...matrix, year: yearKey, cachedAt: new Date().toISOString() });
  futureMatrixMemory.set(yearKey, entry);
  openDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_FUTURE_MATRIX, 'readwrite');
      tx.objectStore(STORE_FUTURE_MATRIX).put(entry);
    } catch (err) {
      console.warn('[dailyDataCache] IDB put failed for futureMatrix', yearKey, err);
    }
  });
}

/**
 * @param {number|string} year Target year.
 * @returns {Promise<object|null>} The hydrated matrix entry, or null if not persisted.
 */
export async function hydrateFutureMatrixFromIdb(year) {
  const yearKey = String(year);
  if (futureMatrixMemory.has(yearKey)) return futureMatrixMemory.get(yearKey);
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_FUTURE_MATRIX, 'readonly');
      const req = tx.objectStore(STORE_FUTURE_MATRIX).get(yearKey);
      req.onsuccess = () => {
        const entry = req.result || null;
        if (entry) futureMatrixMemory.set(yearKey, entry);
        resolve(entry);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Clears every in-memory cache (does not touch IndexedDB). Test/reset use only. */
export function clearMemoryCache() {
  dailyMemory = new Map();
  masterTasksMemory = null;
  futureMatrixMemory = new Map();
}
