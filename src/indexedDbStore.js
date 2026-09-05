/**
 * @file indexedDbStore.js
 * @description Client IndexedDB storage layer for Day Planner.
 * Enables 0ms instant startup, offline persistence, and optimistic mutation queuing.
 */

// Names below (IDB_* prefix, idb* function names) are kept identical to gas-app/Script.html's
// hand-duplicated copy on purpose -- see .agents/rules/sync-src-and-gas-app.md. Script.html
// can't `import` ES modules, so a future build step folding this file into its generated engine
// bundle can only splice in flat top-level declarations verbatim; the names here ARE the contract.
export const IDB_NAME = 'day-planner-db';
export const IDB_VERSION = 3;

export const IDB_STORE_DAILY = 'dailyData';
export const IDB_STORE_MONTHLY_NOTES = 'monthlyNotes';
export const IDB_STORE_MASTER_TASKS = 'masterTasks';
export const IDB_STORE_OUTBOX = 'outboxQueue';
// Read-only cache of a whole month's {tasks, calendarEvents, noteContent} per day, used to
// render the monthly-calendar view and warm the rolling 3-month cache in the background.
// Deliberately separate from IDB_STORE_DAILY (the single-writer, edit-backing store for the
// currently open day) so a background month-batch response can never race a fresher
// single-day write or a pending offline edit.
export const IDB_STORE_MONTH_OVERVIEW = 'monthOverview';

// Generic storeName-keyed API below still addresses stores via this object -- kept for that
// internal use and for tests exercising the generic API directly.
export const STORES = {
  DAILY_DATA: IDB_STORE_DAILY,
  MONTHLY_NOTES: IDB_STORE_MONTHLY_NOTES,
  MASTER_TASKS: IDB_STORE_MASTER_TASKS,
  OUTBOX_QUEUE: IDB_STORE_OUTBOX,
  MONTH_OVERVIEW: IDB_STORE_MONTH_OVERVIEW
};

const memoryFallbackStore = {
  dailyData: {},
  monthlyNotes: {},
  masterTasks: {},
  outboxQueue: [],
  monthOverview: {}
};

/**
 * Checks if IndexedDB is supported in the current environment.
 * @returns {boolean}
 */
export function idbSupported() {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

// Opening the DB is idempotent, so cache the in-flight/opened promise instead of issuing a
// fresh indexedDB.open() per call — a month-batch write otherwise means ~30 separate opens.
let dbPromise = null;

/**
 * Opens or initializes the IndexedDB database. The open call is memoized process-wide.
 * @returns {Promise<IDBDatabase|null>}
 */
export function idbOpen() {
  if (!idbSupported()) {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORES.DAILY_DATA)) {
          db.createObjectStore(STORES.DAILY_DATA, { keyPath: 'dateStr' });
        }
        if (!db.objectStoreNames.contains(STORES.MONTHLY_NOTES)) {
          db.createObjectStore(STORES.MONTHLY_NOTES, { keyPath: 'monthStr' });
        }
        if (!db.objectStoreNames.contains(STORES.MASTER_TASKS)) {
          db.createObjectStore(STORES.MASTER_TASKS, { keyPath: 'monthStr' });
        }
        if (!db.objectStoreNames.contains(STORES.OUTBOX_QUEUE)) {
          db.createObjectStore(STORES.OUTBOX_QUEUE, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(STORES.MONTH_OVERVIEW)) {
          db.createObjectStore(STORES.MONTH_OVERVIEW, { keyPath: 'monthStr' });
        }
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.warn('IndexedDB open error:', event.target?.error);
        dbPromise = null; // allow a retry on the next call instead of caching a permanent failure
        resolve(null);
      };

      // A version bump (IDB_VERSION) can't run its upgrade transaction while another tab/window
      // still holds an open connection at the old version -- the request just sits pending with
      // no onsuccess/onupgradeneeded/onerror, which without this handler means every caller
      // awaiting idbOpen() hangs silently forever (no console output, no error) instead of falling
      // back to "no cache". Resolve null now and drop the memoized promise so the next call
      // retries fresh, once the other tab has closed/upgraded.
      request.onblocked = () => {
        console.warn('IndexedDB open blocked by another open tab/connection at an older version');
        dbPromise = null;
        resolve(null);
      };
    } catch (err) {
      console.warn('idbOpen: indexedDB.open() threw synchronously (e.g. private browsing)', err);
      dbPromise = null;
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Retrieves a record by key from a specified store.
 * @param {string} storeName Store name
 * @param {string|number} key Record key
 * @returns {Promise<any>}
 */
export async function getItem(storeName, key) {
  const db = await idbOpen();
  if (!db) {
    return memoryFallbackStore[storeName] ? memoryFallbackStore[storeName][key] || null : null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => {
        console.error(`getItem: IndexedDB request failed for store "${storeName}"`, req.error);
        resolve(null);
      };
    } catch (e) {
      console.warn(`getItem: transaction on store "${storeName}" threw synchronously`, e);
      resolve(null);
    }
  });
}

/**
 * Strips any Proxy-based reactivity wrapping (Alpine, Vue, etc.) from a value before it's
 * handed to IndexedDB's structured-clone algorithm, which throws DataCloneError on a bare
 * Proxy even when the data it wraps is plain and JSON-serializable.
 * @param {object} item Value to store.
 * @returns {object} Plain, clone-safe copy of `item`.
 */
function toCloneable(item) {
  return JSON.parse(JSON.stringify(item));
}

/**
 * Stores or updates a record in the specified store.
 * @param {string} storeName Store name
 * @param {object} item Record item object
 * @returns {Promise<boolean>}
 */
export async function setItem(storeName, item) {
  const db = await idbOpen();
  if (!db) {
    if (storeName === STORES.OUTBOX_QUEUE) {
      if (!item.id) item.id = Date.now() + Math.random();
      memoryFallbackStore.outboxQueue.push(item);
    } else {
      const key = item.dateStr || item.monthStr || item.id;
      if (!key) {
        throw new Error(`setItem: item for store "${storeName}" has no dateStr/monthStr/id key to store under`);
      }
      memoryFallbackStore[storeName][key] = item;
    }
    return true;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      // A reactive framework's Proxy-wrapped state (Alpine, Vue, etc.) throws DataCloneError
      // from IndexedDB's structured-clone algorithm even when the underlying data is plain
      // JSON -- round-trip through JSON first to hand the store a plain, clone-safe copy.
      const req = store.put(toCloneable(item));
      req.onsuccess = () => resolve(true);
      req.onerror = () => {
        console.error(`setItem: IndexedDB request failed for store "${storeName}"`, req.error);
        resolve(false);
      };
    } catch (e) {
      console.warn(`setItem: transaction on store "${storeName}" threw synchronously`, e);
      resolve(false);
    }
  });
}

/**
 * Stores or updates many records in the specified store within a single transaction. Use this
 * instead of looping setItem() for a batch write (e.g. a month's worth of daily records) — one
 * transaction instead of N avoids N redundant idbOpen()/transaction round trips.
 * @param {string} storeName Store name
 * @param {Array<object>} items Record item objects
 * @returns {Promise<boolean>}
 */
export async function setItems(storeName, items) {
  if (!items || items.length === 0) return true;
  const db = await idbOpen();
  if (!db) {
    items.forEach((item) => {
      const key = item.dateStr || item.monthStr || item.id;
      if (!key) {
        throw new Error(`setItems: item for store "${storeName}" has no dateStr/monthStr/id key to store under`);
      }
      memoryFallbackStore[storeName][key] = item;
    });
    return true;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      items.forEach((item) => store.put(toCloneable(item)));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        console.error(`setItems: IndexedDB transaction failed for store "${storeName}"`, tx.error);
        resolve(false);
      };
    } catch (e) {
      console.warn(`setItems: transaction on store "${storeName}" threw synchronously`, e);
      resolve(false);
    }
  });
}

/**
 * Retrieves all items from a specified store.
 * @param {string} storeName Store name
 * @returns {Promise<Array<any>>}
 */
export async function getAllItems(storeName) {
  const db = await idbOpen();
  if (!db) {
    if (storeName === STORES.OUTBOX_QUEUE) {
      return memoryFallbackStore.outboxQueue.slice();
    }
    return Object.values(memoryFallbackStore[storeName] || {});
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => {
        console.error(`getAllItems: IndexedDB request failed for store "${storeName}"`, req.error);
        resolve([]);
      };
    } catch (e) {
      console.warn(`getAllItems: transaction on store "${storeName}" threw synchronously`, e);
      resolve([]);
    }
  });
}

/**
 * Deletes an item by key from the specified store.
 * @param {string} storeName Store name
 * @param {string|number} key Record key
 * @returns {Promise<boolean>}
 */
export async function deleteItem(storeName, key) {
  const db = await idbOpen();
  if (!db) {
    if (storeName === STORES.OUTBOX_QUEUE) {
      memoryFallbackStore.outboxQueue = memoryFallbackStore.outboxQueue.filter((item) => item.id !== key);
    } else if (memoryFallbackStore[storeName]) {
      delete memoryFallbackStore[storeName][key];
    }
    return true;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => {
        console.error(`deleteItem: IndexedDB request failed for store "${storeName}"`, req.error);
        resolve(false);
      };
    } catch (e) {
      console.warn(`deleteItem: transaction on store "${storeName}" threw synchronously`, e);
      resolve(false);
    }
  });
}

/** @param {string} dateStr Date string e.g. "2026-08-15". @returns {Promise<object|null>} Cached daily-page record, if any. */
export async function idbGetDaily(dateStr) {
  return getItem(STORES.DAILY_DATA, dateStr);
}

/** @param {string} dateStr Date string e.g. "2026-08-15". @param {object} payload Daily-page data to cache. @returns {Promise<boolean>} */
export async function idbSaveDaily(dateStr, payload) {
  const item = Object.assign({}, payload, { dateStr: dateStr, cachedAt: new Date().toISOString() });
  return setItem(STORES.DAILY_DATA, item);
}

// getMasterTasks() always returns the same global undated-task list regardless of which month is
// selected (the "monthYearStr" param it's called with is just a display label) -- so unlike
// idbGetDaily/getMonthlyNotes, master tasks are cached under one fixed key rather than duplicating
// the identical list once per month a user happens to visit.
const MASTER_TASKS_CACHE_KEY = 'all';

/** @returns {Promise<{tasks: Array<object>, cachedAt: string}|null>} Cached master task list, if any. */
export async function idbGetMasterTasks() {
  return getItem(STORES.MASTER_TASKS, MASTER_TASKS_CACHE_KEY);
}

/** @param {Array<object>} tasks Master task list to cache. @returns {Promise<boolean>} */
export async function idbSaveMasterTasks(tasks) {
  const item = { monthStr: MASTER_TASKS_CACHE_KEY, tasks: tasks || [], cachedAt: new Date().toISOString() };
  return setItem(STORES.MASTER_TASKS, item);
}

/** @param {string} monthStr Month string e.g. "2026-08". @returns {Promise<object|null>} Cached monthly-notes record, if any. */
export async function getMonthlyNotes(monthStr) {
  return getItem(STORES.MONTHLY_NOTES, monthStr);
}

/** @param {string} monthStr Month string e.g. "2026-08". @param {object} data Monthly-notes data to cache. @returns {Promise<boolean>} */
export async function saveMonthlyNotes(monthStr, data) {
  const item = Object.assign({}, data, { monthStr: monthStr, cachedAt: new Date().toISOString() });
  return setItem(STORES.MONTHLY_NOTES, item);
}

/** @param {string} monthStr Month string e.g. "2026-08". @returns {Promise<object|null>} Cached whole-month overview record (per-day tasks/events/notes), if any. */
export async function idbGetMonthOverview(monthStr) {
  return getItem(STORES.MONTH_OVERVIEW, monthStr);
}

/** @param {string} monthStr Month string e.g. "2026-08". @param {Array<object>} days Per-day overview entries for the month. @returns {Promise<boolean>} */
export async function idbSaveMonthOverview(monthStr, days) {
  const item = { monthStr: monthStr, days: days, cachedAt: new Date().toISOString() };
  return setItem(STORES.MONTH_OVERVIEW, item);
}

/**
 * Queues an offline write for later replay once connectivity returns.
 * @param {string} type Mutation type tag (see `OUTBOX_MUTATION_TYPES` in gasBridge.js).
 * @param {object} payload Mutation payload to replay.
 * @returns {Promise<boolean>}
 */
export async function idbEnqueueMutation(type, payload) {
  const mutation = {
    type: type,
    payload: payload,
    enqueuedAt: new Date().toISOString()
  };
  return setItem(STORES.OUTBOX_QUEUE, mutation);
}

/** @returns {Promise<Array<object>>} All queued offline mutations awaiting replay. */
export async function idbGetOutbox() {
  return getAllItems(STORES.OUTBOX_QUEUE);
}

/** @param {string|number} id Outbox queue record id. @returns {Promise<boolean>} */
export async function idbDequeueMutation(id) {
  return deleteItem(STORES.OUTBOX_QUEUE, id);
}

const IndexedDbStore = {
  IDB_NAME,
  IDB_VERSION,
  STORES,
  idbSupported,
  idbOpen,
  getItem,
  setItem,
  setItems,
  getAllItems,
  deleteItem,
  idbGetDaily,
  idbSaveDaily,
  idbGetMonthOverview,
  idbSaveMonthOverview,
  idbGetMasterTasks,
  idbSaveMasterTasks,
  getMonthlyNotes,
  saveMonthlyNotes,
  idbEnqueueMutation,
  idbGetOutbox,
  idbDequeueMutation,
  _getMemoryFallback: () => memoryFallbackStore
};

export default IndexedDbStore;
