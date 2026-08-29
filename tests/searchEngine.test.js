/**
 * @file searchEngine.test.js
 * @description Unit tests for universal search query execution across calendar, tasks, notes, and index records.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeUniversalSearch } from '../src/searchEngine.js';

describe('Universal Search Engine Unit Tests', () => {
  const sampleStore = {
    calendarEvents: [
      { title: 'Q3 Financial Review', startTime: '2026-08-15T14:00:00Z', location: 'Conference Room 3' }
    ],
    dailyTasks: [
      { title: '[A1] Review Q3 budget draft', dueDate: '2026-08-15', status: '•' }
    ],
    masterTasks: [
      { title: 'Hire Q3 lead designer', category: 'Projects' }
    ],
    dailyNotes: [
      { date: '2026-08-15', content: 'Met with marketing team to outline Q3 campaigns and metrics.' }
    ],
    indexEntries: [
      { topic: 'Finance', summary: 'Approved Q3 marketing budget', date: '2026-08-15' }
    ]
  };

  it('should find matches across all entities for query "Q3"', () => {
    const searchRes = executeUniversalSearch('Q3', sampleStore);
    assert.equal(searchRes.totalMatches, 5);
    assert.equal(searchRes.calendar.length, 1);
    assert.equal(searchRes.tasks.length, 2);
    assert.equal(searchRes.notes.length, 1);
    assert.equal(searchRes.index.length, 1);
  });

  it('should filter correctly for specific terms like "budget"', () => {
    const searchRes = executeUniversalSearch('budget', sampleStore);
    assert.equal(searchRes.totalMatches, 2); // 1 task + 1 index
    assert.equal(searchRes.tasks.length, 1);
    assert.equal(searchRes.index.length, 1);
  });

  it('should return empty results for unmatched query', () => {
    const searchRes = executeUniversalSearch('nonexistentxyz', sampleStore);
    assert.equal(searchRes.totalMatches, 0);
  });

  it('should return empty results for a blank/whitespace-only query without inspecting the store', () => {
    const searchRes = executeUniversalSearch('   ');
    assert.equal(searchRes.totalMatches, 0);
    assert.deepEqual(searchRes.calendar, []);
    assert.deepEqual(searchRes.tasks, []);
  });

  it('should tolerate a store with missing entity arrays', () => {
    const searchRes = executeUniversalSearch('anything', {});
    assert.equal(searchRes.totalMatches, 0);
  });

  it('should route a master task (no dueDate) to master-tasks and a scheduled daily task to daily', () => {
    const searchRes = executeUniversalSearch('Q3', sampleStore);
    const masterHit = searchRes.tasks.find(t => t.title === 'Hire Q3 lead designer');
    const dailyHit = searchRes.tasks.find(t => t.title === '[A1] Review Q3 budget draft');
    assert.equal(masterHit.targetView, 'master-tasks');
    assert.equal(dailyHit.targetView, 'daily');
  });

  it('should report the calendar event date field as the local day, not the UTC-shifted day', () => {
    const searchRes = executeUniversalSearch('Late Night Call', {
      calendarEvents: [
        { title: 'Late Night Call', startTime: '2026-08-15T23:30:00-07:00' }
      ]
    });
    assert.equal(searchRes.calendar.length, 1);
    assert.equal(searchRes.calendar[0].date, '2026-08-15');
  });

  it('should extract a note snippet centered on the matched query text', () => {
    const searchRes = executeUniversalSearch('campaigns', sampleStore);
    assert.equal(searchRes.notes.length, 1);
    assert.ok(searchRes.notes[0].snippet.toLowerCase().includes('campaigns'));
    assert.ok(searchRes.notes[0].snippet.startsWith('...'));
    assert.ok(searchRes.notes[0].snippet.endsWith('...'));
  });
});
