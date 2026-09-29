/**
 * @file dailyDataCache.test.js
 * @description Unit tests for the memory-first daily data cache. IndexedDB is unavailable in
 * the node test runner (typeof indexedDB === 'undefined'), which exercises exactly the
 * memory-only fallback path this module must degrade to gracefully on a locked-down browser.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCached,
  setCached,
  invalidateCached,
  hydrateFromIdb,
  primeFromRange,
  getCachedRange,
  getCachedMasterTasks,
  setCachedMasterTasks,
  hydrateMasterTasksFromIdb,
  getCachedFutureMatrix,
  setCachedFutureMatrix,
  hydrateFutureMatrixFromIdb,
  saveNoteRevision,
  getNoteRevisions,
  hydrateNoteRevisionsFromIdb,
  clearMemoryCache
} from '../src/dailyDataCache.js';

describe('Daily Data Cache Unit Tests', () => {
  beforeEach(() => {
    clearMemoryCache();
  });

  it('should return null for an uncached date', () => {
    assert.equal(getCached('2026-09-25'), null);
  });

  it('should store and retrieve an entry by date', () => {
    setCached('2026-09-25', { tasks: [{ id: 't1' }], calendarEvents: [], noteContent: 'hi', docUrl: '#' });
    const cached = getCached('2026-09-25');
    assert.equal(cached.date, '2026-09-25');
    assert.deepEqual(cached.tasks, [{ id: 't1' }]);
    assert.equal(cached.noteContent, 'hi');
  });

  it('should deep-clone stored data so later mutation of the source object does not affect the cache', () => {
    const source = { tasks: [{ id: 't1', starred: false }], calendarEvents: [], noteContent: 'x', docUrl: '#' };
    setCached('2026-09-25', source);
    source.tasks[0].starred = true;
    assert.equal(getCached('2026-09-25').tasks[0].starred, false);
  });

  it('should overwrite an existing entry on re-set (write-through on edit)', () => {
    setCached('2026-09-25', { tasks: [], calendarEvents: [], noteContent: 'first draft', docUrl: '#' });
    setCached('2026-09-25', { tasks: [], calendarEvents: [], noteContent: 'edited draft', docUrl: '#' });
    assert.equal(getCached('2026-09-25').noteContent, 'edited draft');
  });

  it('should remove an entry on invalidate', () => {
    setCached('2026-09-25', { tasks: [], calendarEvents: [], noteContent: 'x', docUrl: '#' });
    invalidateCached('2026-09-25');
    assert.equal(getCached('2026-09-25'), null);
  });

  it('should resolve null from hydrateFromIdb when IndexedDB is unavailable (memory-only fallback)', async () => {
    const result = await hydrateFromIdb('2026-09-25');
    assert.equal(result, null);
  });

  it('should return the already-cached entry from hydrateFromIdb without touching IndexedDB', async () => {
    setCached('2026-09-25', { tasks: [], calendarEvents: [], noteContent: 'x', docUrl: '#' });
    const result = await hydrateFromIdb('2026-09-25');
    assert.equal(result.noteContent, 'x');
  });

  it('primeFromRange should fill only dates not already cached', () => {
    setCached('2026-09-25', { tasks: [], calendarEvents: [], noteContent: 'kept', docUrl: '#' });
    primeFromRange({
      '2026-09-25': { tasks: [], calendarEvents: [], noteContent: 'overwritten?', docUrl: '#' },
      '2026-09-26': { tasks: [], calendarEvents: [], noteContent: 'new', docUrl: '#' }
    });
    assert.equal(getCached('2026-09-25').noteContent, 'kept', 'must not clobber an already-cached date');
    assert.equal(getCached('2026-09-26').noteContent, 'new');
  });

  it('primeFromRange should still cache a day whose noteContent is null (no note section yet, not "nothing fetched")', () => {
    primeFromRange({
      '2026-09-27': { tasks: [{ id: 't9' }], calendarEvents: [], noteContent: null, docUrl: '' }
    });
    const cached = getCached('2026-09-27');
    assert.notEqual(cached, null, 'a null noteContent must not be treated as an uncached/missing day');
    assert.deepEqual(cached.tasks, [{ id: 't9' }]);
    assert.equal(cached.noteContent, null);
  });

  it('primeFromRange should skip a day with no entry at all', () => {
    primeFromRange({ '2026-09-28': null });
    assert.equal(getCached('2026-09-28'), null);
  });

  it('getCachedRange should return only the already-cached dates within an inclusive range', () => {
    setCached('2026-09-24', { tasks: [], calendarEvents: [], noteContent: 'a', docUrl: '#' });
    setCached('2026-09-26', { tasks: [], calendarEvents: [], noteContent: 'b', docUrl: '#' });
    setCached('2026-10-01', { tasks: [], calendarEvents: [], noteContent: 'out of range', docUrl: '#' });
    const range = getCachedRange('2026-09-25', '2026-09-30');
    assert.deepEqual(Object.keys(range).sort(), ['2026-09-26']);
    assert.equal(range['2026-09-26'].noteContent, 'b');
  });

  it('should store and retrieve master tasks', () => {
    assert.equal(getCachedMasterTasks(), null);
    setCachedMasterTasks([{ id: 'm1', title: 'Task 1' }]);
    const cached = getCachedMasterTasks();
    assert.deepEqual(cached.tasks, [{ id: 'm1', title: 'Task 1' }]);
    assert.equal(typeof cached.cachedAt, 'string');
  });

  it('should overwrite the master tasks cache on re-set', () => {
    setCachedMasterTasks([{ id: 'm1' }]);
    setCachedMasterTasks([{ id: 'm2' }]);
    assert.deepEqual(getCachedMasterTasks().tasks, [{ id: 'm2' }]);
  });

  it('should resolve the already-cached master tasks entry from hydrateMasterTasksFromIdb without touching IndexedDB', async () => {
    setCachedMasterTasks([{ id: 'm1' }]);
    const hydrated = await hydrateMasterTasksFromIdb();
    assert.deepEqual(hydrated.tasks, [{ id: 'm1' }]);
  });

  it('should resolve null from hydrateMasterTasksFromIdb when nothing is cached and IndexedDB is unavailable', async () => {
    assert.equal(await hydrateMasterTasksFromIdb(), null);
  });

  it('should store and retrieve the future matrix by year, keyed independently per year', () => {
    assert.equal(getCachedFutureMatrix(2026), null);
    setCachedFutureMatrix(2026, { months: { '2026-01': [] } });
    setCachedFutureMatrix(2027, { months: { '2027-01': [{ id: 'f1' }] } });
    assert.deepEqual(getCachedFutureMatrix(2026).months, { '2026-01': [] });
    assert.deepEqual(getCachedFutureMatrix(2027).months, { '2027-01': [{ id: 'f1' }] });
    assert.equal(getCachedFutureMatrix(2026).year, '2026', 'year key should be normalized to a string');
  });

  it('should resolve the already-cached future matrix entry from hydrateFutureMatrixFromIdb without touching IndexedDB', async () => {
    setCachedFutureMatrix(2026, { months: {} });
    const hydrated = await hydrateFutureMatrixFromIdb(2026);
    assert.equal(hydrated.year, '2026');
  });

  it('should resolve null from hydrateFutureMatrixFromIdb for an uncached year when IndexedDB is unavailable', async () => {
    assert.equal(await hydrateFutureMatrixFromIdb(2030), null);
  });

  it('should save and retrieve note revisions, newest first', () => {
    assert.deepEqual(getNoteRevisions('2026-09-29'), []);
    saveNoteRevision('2026-09-29', '## Topic 1\nFirst draft');
    saveNoteRevision('2026-09-29', '## Topic 1\nSecond draft\n## Topic 2\nAnother card');

    const revs = getNoteRevisions('2026-09-29');
    assert.equal(revs.length, 2);
    assert.equal(revs[0].noteContent, '## Topic 1\nSecond draft\n## Topic 2\nAnother card');
    assert.equal(revs[0].cardCount, 2);
    assert.equal(revs[1].noteContent, '## Topic 1\nFirst draft');
    assert.equal(revs[1].cardCount, 1);
  });

  it('should deduplicate sequential identical note revision saves', () => {
    saveNoteRevision('2026-09-29', 'Identical note');
    saveNoteRevision('2026-09-29', 'Identical note');
    const revs = getNoteRevisions('2026-09-29');
    assert.equal(revs.length, 1);
  });

  it('should cap rolling note revisions at 30', () => {
    for (let i = 1; i <= 35; i++) {
      saveNoteRevision('2026-09-29', `Revision ${i}`);
    }
    const revs = getNoteRevisions('2026-09-29');
    assert.equal(revs.length, 30);
    assert.equal(revs[0].noteContent, 'Revision 35');
    assert.equal(revs[29].noteContent, 'Revision 6');
  });

  it('should resolve already-cached note revisions from hydrateNoteRevisionsFromIdb without touching IndexedDB', async () => {
    saveNoteRevision('2026-09-29', 'Snapshot 1');
    const hydrated = await hydrateNoteRevisionsFromIdb('2026-09-29');
    assert.equal(hydrated.length, 1);
    assert.equal(hydrated[0].noteContent, 'Snapshot 1');
  });

  it('should resolve empty array from hydrateNoteRevisionsFromIdb when nothing cached and IndexedDB unavailable', async () => {
    const hydrated = await hydrateNoteRevisionsFromIdb('2026-10-15');
    assert.deepEqual(hydrated, []);
  });
});
