/**
 * @file indexedDbStore.js
 * @description Client IndexedDB storage layer for Day Planner.
 * Enables 0ms instant startup, offline persistence, and optimistic mutation queuing.
 */

export const DB_NAME = 'day-planner-db';
export const DB_VERSION = 2;

export const STORES = {
  DAILY_DATA: 'dailyData',
  MONTHLY_NOTES: 'monthlyNotes',
  MASTER_TASKS: 'masterTasks',
  OUTBOX_QUEUE: 'outboxQueue',
  // Read-only cache of a whole month's {tasks, calendarEvents, noteContent} per day, used to
  // render the monthly-calendar view and warm the rolling 3-month cache in the background.
  // Deliberately separate from DAILY_DATA (the single-writer, edit-backing store for the
  // currently open day) so a background month-batch response can never race a fresher
  // single-day write or a pending offline edit.
  MONTH_OVERVIEW: 'monthOverview'
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
export function isSupported() {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

// Opening the DB is idempotent, so cache the in-flight/opened promise instead of issuing a
// fresh indexedDB.open() per call — a month-batch write otherwise means ~30 separate opens.
let dbPromise = null;

/**
 * Opens or initializes the IndexedDB database. The open call is memoized process-wide.
 * @returns {Promise<IDBDatabase|null>}
 */
export function openDb() {
  if (!isSupported()) {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

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
    } catch (err) {
      console.warn('openDb: indexedDB.open() threw synchronously (e.g. private browsing)', err);
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
  const db = await openDb();
  if (!db) {
    return memoryFallbackStore[storeName] ? memoryFallbackStore[storeName][key] || null : null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (e) {
      console.warn(`getItem: transaction on store "${storeName}" threw synchronously`, e);
      resolve(null);
    }
  });
}

/**
 * Stores or updates a record in the specified store.
 * @param {string} storeName Store name
 * @param {object} item Record item object
 * @returns {Promise<boolean>}
 */
export async function setItem(storeName, item) {
  const db = await openDb();
  if (!db) {
    if (storeName === STORES.OUTBOX_QUEUE) {
      if (!item.id) item.id = Date.now() + Math.random();
      memoryFallbackStore.outboxQueue.push(item);
    } else {
      const key = item.dateStr || item.monthStr || item.id;
      if (key) {
        memoryFallbackStore[storeName][key] = item;
      }
    }
    return true;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) {
      console.warn(`setItem: transaction on store "${storeName}" threw synchronously`, e);
      resolve(false);
    }
  });
}

/**
 * Stores or updates many records in the specified store within a single transaction. Use this
 * instead of looping setItem() for a batch write (e.g. a month's worth of daily records) — one
 * transaction instead of N avoids N redundant openDb()/transaction round trips.
 * @param {string} storeName Store name
 * @param {Array<object>} items Record item objects
 * @returns {Promise<boolean>}
 */
export async function setItems(storeName, items) {
  if (!items || items.length === 0) return true;
  const db = await openDb();
  if (!db) {
    items.forEach((item) => {
      const key = item.dateStr || item.monthStr || item.id;
      if (key) memoryFallbackStore[storeName][key] = item;
    });
    return true;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      items.forEach((item) => store.put(item));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
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
  const db = await openDb();
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
      req.onerror = () => resolve([]);
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
  const db = await openDb();
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
      req.onerror = () => resolve(false);
    } catch (e) {
      console.warn(`deleteItem: transaction on store "${storeName}" threw synchronously`, e);
      resolve(false);
    }
  });
}

/** @param {string} dateStr Date string e.g. "2026-08-15". @returns {Promise<object|null>} Cached daily-page record, if any. */
export async function getDaily(dateStr) {
  return getItem(STORES.DAILY_DATA, dateStr);
}

/** @param {string} dateStr Date string e.g. "2026-08-15". @param {object} payload Daily-page data to cache. @returns {Promise<boolean>} */
export async function saveDaily(dateStr, payload) {
  const item = Object.assign({}, payload, { dateStr: dateStr, cachedAt: new Date().toISOString() });
  return setItem(STORES.DAILY_DATA, item);
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
export async function getMonthOverview(monthStr) {
  return getItem(STORES.MONTH_OVERVIEW, monthStr);
}

/** @param {string} monthStr Month string e.g. "2026-08". @param {Array<object>} days Per-day overview entries for the month. @returns {Promise<boolean>} */
export async function saveMonthOverview(monthStr, days) {
  const item = { monthStr: monthStr, days: days, cachedAt: new Date().toISOString() };
  return setItem(STORES.MONTH_OVERVIEW, item);
}

/**
 * Queues an offline write for later replay once connectivity returns.
 * @param {string} type Mutation type tag (see `OUTBOX_MUTATION_TYPES` in gasBridge.js).
 * @param {object} payload Mutation payload to replay.
 * @returns {Promise<boolean>}
 */
export async function enqueueMutation(type, payload) {
  const mutation = {
    type: type,
    payload: payload,
    enqueuedAt: new Date().toISOString()
  };
  return setItem(STORES.OUTBOX_QUEUE, mutation);
}

/** @returns {Promise<Array<object>>} All queued offline mutations awaiting replay. */
export async function getOutbox() {
  return getAllItems(STORES.OUTBOX_QUEUE);
}

/** @param {string|number} id Outbox queue record id. @returns {Promise<boolean>} */
export async function dequeueMutation(id) {
  return deleteItem(STORES.OUTBOX_QUEUE, id);
}

const IndexedDbStore = {
  DB_NAME,
  DB_VERSION,
  STORES,
  isSupported,
  openDb,
  getItem,
  setItem,
  setItems,
  getAllItems,
  deleteItem,
  getDaily,
  saveDaily,
  getMonthOverview,
  saveMonthOverview,
  getMonthlyNotes,
  saveMonthlyNotes,
  enqueueMutation,
  getOutbox,
  dequeueMutation,
  _getMemoryFallback: () => memoryFallbackStore
};

export default IndexedDbStore;
