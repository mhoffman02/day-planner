/**
 * @file indexedDbStore.js
 * @description Client IndexedDB storage layer for Day Planner.
 * Enables 0ms instant startup, offline persistence, and optimistic mutation queuing.
 */

export const DB_NAME = 'day-planner-db';
export const DB_VERSION = 1;

export const STORES = {
  DAILY_DATA: 'dailyData',
  MONTHLY_NOTES: 'monthlyNotes',
  MASTER_TASKS: 'masterTasks',
  OUTBOX_QUEUE: 'outboxQueue'
};

const memoryFallbackStore = {
  dailyData: {},
  monthlyNotes: {},
  masterTasks: {},
  outboxQueue: []
};

/**
 * Checks if IndexedDB is supported in the current environment.
 * @returns {boolean}
 */
export function isSupported() {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

/**
 * Opens or initializes the IndexedDB database.
 * @returns {Promise<IDBDatabase|null>}
 */
export function openDb() {
  if (!isSupported()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
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
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.warn('IndexedDB open error:', event.target?.error);
        resolve(null);
      };
    } catch (err) {
      resolve(null);
    }
  });
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
      resolve(false);
    }
  });
}

export async function getDaily(dateStr) {
  return getItem(STORES.DAILY_DATA, dateStr);
}

export async function saveDaily(dateStr, payload) {
  const item = Object.assign({}, payload, { dateStr: dateStr, cachedAt: new Date().toISOString() });
  return setItem(STORES.DAILY_DATA, item);
}

export async function getMonthlyNotes(monthStr) {
  return getItem(STORES.MONTHLY_NOTES, monthStr);
}

export async function saveMonthlyNotes(monthStr, data) {
  const item = Object.assign({}, data, { monthStr: monthStr, cachedAt: new Date().toISOString() });
  return setItem(STORES.MONTHLY_NOTES, item);
}

export async function enqueueMutation(type, payload) {
  const mutation = {
    type: type,
    payload: payload,
    enqueuedAt: new Date().toISOString()
  };
  return setItem(STORES.OUTBOX_QUEUE, mutation);
}

export async function getOutbox() {
  return getAllItems(STORES.OUTBOX_QUEUE);
}

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
  getAllItems,
  deleteItem,
  getDaily,
  saveDaily,
  getMonthlyNotes,
  saveMonthlyNotes,
  enqueueMutation,
  getOutbox,
  dequeueMutation,
  _getMemoryFallback: () => memoryFallbackStore
};

export default IndexedDbStore;
