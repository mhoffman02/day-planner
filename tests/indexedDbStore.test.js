/**
 * @file indexedDbStore.test.js
 * @description Unit tests for client IndexedDB storage layer and memory fallback.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import IndexedDbStore, { STORES } from '../src/indexedDbStore.js';

describe('IndexedDB Client Store Unit Tests', () => {

  it('should detect environment support gracefully', () => {
    const supported = IndexedDbStore.isSupported();
    assert.strictEqual(typeof supported, 'boolean');
  });

  it('should report unsupported (falls back to in-memory store) under Node\'s test runner', () => {
    // node:test has no global `indexedDB`, so the memory fallback store must be used everywhere below.
    assert.strictEqual(IndexedDbStore.isSupported(), false);
  });

  it('should return null for a daily/monthly key that was never saved', async () => {
    assert.strictEqual(await IndexedDbStore.getDaily('1999-01-01'), null);
    assert.strictEqual(await IndexedDbStore.getMonthlyNotes('1999-01'), null);
  });

  it('should delete a stored daily record so it is no longer retrievable', async () => {
    await IndexedDbStore.saveDaily('2026-08-18', { tasks: [] });
    assert.ok(await IndexedDbStore.getDaily('2026-08-18'));

    const deleted = await IndexedDbStore.deleteItem(STORES.DAILY_DATA, '2026-08-18');
    assert.strictEqual(deleted, true);
    assert.strictEqual(await IndexedDbStore.getDaily('2026-08-18'), null);
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

    const saved = await IndexedDbStore.saveDaily(testDate, payload);
    assert.strictEqual(saved, true);

    const retrieved = await IndexedDbStore.getDaily(testDate);
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

    const saved = await IndexedDbStore.saveMonthOverview(monthStr, days);
    assert.strictEqual(saved, true);

    const retrieved = await IndexedDbStore.getMonthOverview(monthStr);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.monthStr, monthStr);
    assert.ok(retrieved.cachedAt);
    assert.strictEqual(retrieved.days['2026-09-01'].calendarEvents.length, 1);
    assert.strictEqual(retrieved.days['2026-09-02'].tasks[0].title, '[A1] Ship it');
  });

  it('should return null for a month overview that was never saved', async () => {
    assert.strictEqual(await IndexedDbStore.getMonthOverview('1999-01'), null);
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

  it('should enqueue, list, and dequeue offline mutations in outbox', async () => {
    await IndexedDbStore.enqueueMutation('TASK_STATUS_CHANGE', { taskId: 't1', newStatus: '✓' });
    await IndexedDbStore.enqueueMutation('SAVE_NOTE_CARD', { dateStr: '2026-08-17', noteContent: 'Updated note' });

    const outbox = await IndexedDbStore.getOutbox();
    assert.ok(Array.isArray(outbox));
    assert.ok(outbox.length >= 2);

    const firstItem = outbox[0];
    assert.ok(firstItem.id);
    assert.strictEqual(firstItem.type, 'TASK_STATUS_CHANGE');

    const dequeued = await IndexedDbStore.dequeueMutation(firstItem.id);
    assert.strictEqual(dequeued, true);

    const remainingOutbox = await IndexedDbStore.getOutbox();
    assert.strictEqual(remainingOutbox.some(item => item.id === firstItem.id), false);
  });
});
