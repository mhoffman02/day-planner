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
});
