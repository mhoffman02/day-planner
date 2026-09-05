/**
 * @file indexedDbStore.test.js
 * @description Unit tests for client IndexedDB storage layer and memory fallback.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import IndexedDbStore, { STORES } from '../src/indexedDbStore.js';

describe('IndexedDB Client Store Unit Tests', () => {

  it('should detect environment support gracefully', () => {
    const supported = IndexedDbStore.idbSupported();
    assert.strictEqual(typeof supported, 'boolean');
  });

  it('should report unsupported (falls back to in-memory store) under Node\'s test runner', () => {
    // node:test has no global `indexedDB`, so the memory fallback store must be used everywhere below.
    assert.strictEqual(IndexedDbStore.idbSupported(), false);
  });

  it('should return null for a daily/monthly key that was never saved', async () => {
    assert.strictEqual(await IndexedDbStore.idbGetDaily('1999-01-01'), null);
    assert.strictEqual(await IndexedDbStore.getMonthlyNotes('1999-01'), null);
  });

  it('should delete a stored daily record so it is no longer retrievable', async () => {
    await IndexedDbStore.idbSaveDaily('2026-08-18', { tasks: [] });
    assert.ok(await IndexedDbStore.idbGetDaily('2026-08-18'));

    const deleted = await IndexedDbStore.deleteItem(STORES.DAILY_DATA, '2026-08-18');
    assert.strictEqual(deleted, true);
    assert.strictEqual(await IndexedDbStore.idbGetDaily('2026-08-18'), null);
  });

  it('should return an empty array from getAllItems for a store with nothing saved', async () => {
    const all = await IndexedDbStore.getAllItems(STORES.MASTER_TASKS);
    assert.ok(Array.isArray(all));
  });

  it('should store and retrieve daily data via fallback/native engine', async () => {
    const testDate = '2026-08-17';
    const payload = {
      tasks: [{ id: 't1', title: '[A1] Review Q3 budget', status: '•' }],
      events: [{ id: 'e1', title: 'Sprint Review', startTime: '10:00 AM' }],
      notes: '### #index [Architecture] System Design'
    };

    const saved = await IndexedDbStore.idbSaveDaily(testDate, payload);
    assert.strictEqual(saved, true);

    const retrieved = await IndexedDbStore.idbGetDaily(testDate);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.dateStr, testDate);
    assert.strictEqual(retrieved.tasks.length, 1);
    assert.strictEqual(retrieved.tasks[0].title, '[A1] Review Q3 budget');
    assert.ok(retrieved.cachedAt);
  });

  it('should save and retrieve monthly notes object', async () => {
    const monthStr = '2026-08';
    const data = {
      days: {
        '2026-08-17': { raw: '### #index [General] Notes' }
      }
    };

    const saved = await IndexedDbStore.saveMonthlyNotes(monthStr, data);
    assert.strictEqual(saved, true);

    const retrieved = await IndexedDbStore.getMonthlyNotes(monthStr);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.monthStr, monthStr);
    assert.ok(retrieved.days['2026-08-17']);
  });

  it('should save and retrieve a month overview record', async () => {
    const monthStr = '2026-09';
    const days = {
      '2026-09-01': { tasks: [], calendarEvents: [{ id: 'e1', title: 'Kickoff' }], noteContent: '' },
      '2026-09-02': { tasks: [{ id: 't1', title: '[A1] Ship it', status: '•' }], calendarEvents: [], noteContent: 'notes' }
    };

    const saved = await IndexedDbStore.idbSaveMonthOverview(monthStr, days);
    assert.strictEqual(saved, true);

    const retrieved = await IndexedDbStore.idbGetMonthOverview(monthStr);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.monthStr, monthStr);
    assert.ok(retrieved.cachedAt);
    assert.strictEqual(retrieved.days['2026-09-01'].calendarEvents.length, 1);
    assert.strictEqual(retrieved.days['2026-09-02'].tasks[0].title, '[A1] Ship it');
  });

  it('should return null for a month overview that was never saved', async () => {
    assert.strictEqual(await IndexedDbStore.idbGetMonthOverview('1999-01'), null);
  });

  it('should return null for master tasks when nothing was ever cached', async () => {
    assert.strictEqual(await IndexedDbStore.idbGetMasterTasks(), null);
  });

  it('should save and retrieve the cached master task list', async () => {
    const tasks = [
      { id: 'm1', title: 'Renew passport', category: 'Personal', status: '•' },
      { id: 'm2', title: 'File Q3 taxes', category: 'Finance', status: '✓' }
    ];

    const saved = await IndexedDbStore.idbSaveMasterTasks(tasks);
    assert.strictEqual(saved, true);

    const retrieved = await IndexedDbStore.idbGetMasterTasks();
    assert.ok(retrieved);
    assert.ok(retrieved.cachedAt);
    assert.strictEqual(retrieved.tasks.length, 2);
    assert.strictEqual(retrieved.tasks[1].title, 'File Q3 taxes');
  });

  it('should overwrite (not accumulate) the cached master task list on each save', async () => {
    await IndexedDbStore.idbSaveMasterTasks([{ id: 'm1', title: 'Stale entry' }]);
    await IndexedDbStore.idbSaveMasterTasks([{ id: 'm2', title: 'Fresh entry' }]);

    const retrieved = await IndexedDbStore.idbGetMasterTasks();
    assert.strictEqual(retrieved.tasks.length, 1);
    assert.strictEqual(retrieved.tasks[0].title, 'Fresh entry');
  });

  it('should bulk-write many records via setItems in one call', async () => {
    const items = [
      { dateStr: '2026-10-01', tasks: [] },
      { dateStr: '2026-10-02', tasks: [] },
      { dateStr: '2026-10-03', tasks: [] }
    ];
    const ok = await IndexedDbStore.setItems(STORES.DAILY_DATA, items);
    assert.strictEqual(ok, true);

    for (const item of items) {
      const retrieved = await IndexedDbStore.getItem(STORES.DAILY_DATA, item.dateStr);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.dateStr, item.dateStr);
    }
  });

  it('should no-op setItems on an empty array', async () => {
    assert.strictEqual(await IndexedDbStore.setItems(STORES.DAILY_DATA, []), true);
  });

  it('should not silently report success for a fallback setItem write with no usable key', async () => {
    // Item has none of dateStr/monthStr/id, so the memory-fallback store has nowhere to put it —
    // this must not be reported as a successful write (data would be silently dropped).
    await assert.rejects(
      () => IndexedDbStore.setItem(STORES.DAILY_DATA, { tasks: [] }),
      /key/i
    );
  });

  it('should not silently report success for a fallback setItems batch with a keyless item', async () => {
    await assert.rejects(
      () => IndexedDbStore.setItems(STORES.DAILY_DATA, [{ dateStr: '2026-11-01' }, { tasks: [] }]),
      /key/i
    );
  });

  it('should log the underlying error instead of swallowing it when a native IndexedDB request fails', async () => {
    const originalIndexedDB = global.indexedDB;
    const originalConsoleError = console.error;
    const loggedErrors = [];
    console.error = (...args) => loggedErrors.push(args);

    function makeFailingRequest() {
      const req = { error: null };
      queueMicrotask(() => {
        req.error = new Error('fake IDB request failure');
        if (req.onerror) req.onerror();
      });
      return req;
    }

    const fakeStore = {
      get: makeFailingRequest,
      put: makeFailingRequest,
      delete: makeFailingRequest,
      getAll: makeFailingRequest
    };
    const fakeDb = {
      objectStoreNames: { contains: () => true },
      transaction() {
        const tx = { error: null, objectStore: () => fakeStore };
        queueMicrotask(() => {
          tx.error = new Error('fake IDB transaction failure');
          if (tx.onerror) tx.onerror();
        });
        return tx;
      }
    };
    global.indexedDB = {
      open() {
        const req = {};
        queueMicrotask(() => {
          if (req.onsuccess) req.onsuccess({ target: { result: fakeDb } });
        });
        return req;
      }
    };

    try {
      assert.strictEqual(await IndexedDbStore.getItem(STORES.DAILY_DATA, 'x'), null);
      assert.strictEqual(await IndexedDbStore.setItem(STORES.DAILY_DATA, { dateStr: 'x' }), false);
      assert.strictEqual(await IndexedDbStore.setItems(STORES.DAILY_DATA, [{ dateStr: 'x' }]), false);
      assert.deepStrictEqual(await IndexedDbStore.getAllItems(STORES.DAILY_DATA), []);
      assert.strictEqual(await IndexedDbStore.deleteItem(STORES.DAILY_DATA, 'x'), false);

      assert.ok(loggedErrors.length >= 5, `expected an error to be logged for each of the 5 failed ops, got ${loggedErrors.length}`);
      assert.ok(
        loggedErrors.every((args) => args.some((a) => a instanceof Error)),
        'expected the real underlying Error object to be logged, not swallowed'
      );
    } finally {
      console.error = originalConsoleError;
      global.indexedDB = originalIndexedDB;
    }
  });

  it('should still persist reactive-framework Proxy-wrapped data (would throw DataCloneError against a real IndexedDB otherwise)', async () => {
    // Isolated module instance so this test's own `global.indexedDB`/dbPromise cache can't
    // collide with the "should log the underlying error..." test above, which also swaps
    // `global.indexedDB` and leaves the module's memoized connection pointed at its own fake
    // db afterwards (idbOpen()'s dbPromise cache is never invalidated by restoring the global).
    const { default: freshStore } = await import(`../src/indexedDbStore.js?dataCloneTest=${Date.now()}`);

    const originalIndexedDB = global.indexedDB;
    const backing = new Map();

    const fakeStore = {
      put(item) {
        const req = {};
        queueMicrotask(() => {
          try {
            // Real browsers structured-clone `item` here -- Node's structuredClone is the
            // same V8 algorithm IndexedDB uses, and throws DataCloneError on a bare Proxy
            // exactly like the one reported: "[object Object] could not be cloned".
            const cloned = globalThis.structuredClone(item);
            backing.set(cloned.dateStr, cloned);
            if (req.onsuccess) req.onsuccess();
          } catch (e) {
            req.error = e;
            if (req.onerror) req.onerror();
          }
        });
        return req;
      },
      get(key) {
        const req = {};
        queueMicrotask(() => {
          req.result = backing.get(key);
          if (req.onsuccess) req.onsuccess();
        });
        return req;
      }
    };
    const fakeDb = {
      objectStoreNames: { contains: () => true },
      transaction() {
        return { objectStore: () => fakeStore };
      }
    };
    global.indexedDB = {
      open() {
        const req = {};
        queueMicrotask(() => {
          if (req.onsuccess) req.onsuccess({ target: { result: fakeDb } });
        });
        return req;
      }
    };

    try {
      // Alpine (and Vue) wrap reactive state in a Proxy -- simulate that shape without
      // depending on Alpine itself.
      const reactiveTask = new Proxy({ id: 't1', title: '[A1] Reactive task' }, {
        get: (t, k, r) => Reflect.get(t, k, r),
        ownKeys: (t) => Reflect.ownKeys(t),
        getOwnPropertyDescriptor: (t, k) => Reflect.getOwnPropertyDescriptor(t, k)
      });

      const saved = await freshStore.idbSaveDaily('2026-09-03', { tasks: [reactiveTask], calendarEvents: [] });
      assert.strictEqual(saved, true, 'Proxy-wrapped payload must be sanitized before hitting IndexedDB, not silently dropped');

      const readBack = await freshStore.idbGetDaily('2026-09-03');
      assert.ok(readBack);
      assert.deepStrictEqual(readBack.tasks, [{ id: 't1', title: '[A1] Reactive task' }]);
    } finally {
      global.indexedDB = originalIndexedDB;
    }
  });

  it('should enqueue, list, and dequeue offline mutations in outbox', async () => {
    await IndexedDbStore.idbEnqueueMutation('TASK_STATUS_CHANGE', { taskId: 't1', newStatus: '✓' });
    await IndexedDbStore.idbEnqueueMutation('SAVE_NOTE_CARD', { dateStr: '2026-08-17', noteContent: 'Updated note' });

    const outbox = await IndexedDbStore.idbGetOutbox();
    assert.ok(Array.isArray(outbox));
    assert.ok(outbox.length >= 2);

    const firstItem = outbox[0];
    assert.ok(firstItem.id);
    assert.strictEqual(firstItem.type, 'TASK_STATUS_CHANGE');

    const dequeued = await IndexedDbStore.idbDequeueMutation(firstItem.id);
    assert.strictEqual(dequeued, true);

    const remainingOutbox = await IndexedDbStore.idbGetOutbox();
    assert.strictEqual(remainingOutbox.some(item => item.id === firstItem.id), false);
  });
});
