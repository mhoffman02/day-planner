/**
 * @file searchEngine.test.js
 * @description Unit tests for universal search query execution across calendar, tasks, notes, and index records.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeUniversalSearch, flattenSearchResults } from '../src/searchEngine.js';

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

  it('should flatten search results preserving sequential order', () => {
    const searchRes = executeUniversalSearch('Q3', sampleStore);
    const flat = flattenSearchResults(searchRes);
    assert.equal(flat.length, 5);
    assert.equal(flat[0].type, 'calendar');
    assert.equal(flat[1].type, 'task');
    assert.equal(flat[2].type, 'task');
    assert.equal(flat[3].type, 'note');
    assert.equal(flat[4].type, 'index');
  });

  it('should extract local date for calendar events without UTC day shift', () => {
    const store = {
      calendarEvents: [
        { title: 'Evening Sync', startTime: '2026-08-15T23:30:00', location: 'Home Office' }
      ]
    };
    const res = executeUniversalSearch('Evening', store);
    assert.equal(res.calendar.length, 1);
    assert.equal(res.calendar[0].date, '2026-08-15');
    assert.equal(res.calendar[0].targetView, 'daily');
  });

  it('should search tasks by notes content and set master-tasks target view for undated tasks', () => {
    const store = {
      dailyTasks: [
        { title: '[B2] Refactor UI', notes: 'Check accessibility and keyboard focus states', dueDate: '2026-08-15' }
      ],
      masterTasks: [
        { title: 'Evaluate Cloud Providers', notes: 'Compare GCP vs AWS costs', category: 'Infrastructure' }
      ]
    };
    const res = executeUniversalSearch('accessibility', store);
    assert.equal(res.tasks.length, 1);
    assert.equal(res.tasks[0].title, '[B2] Refactor UI');
    assert.equal(res.tasks[0].targetView, 'daily');

    const masterRes = executeUniversalSearch('AWS', store);
    assert.equal(masterRes.tasks.length, 1);
    assert.equal(masterRes.tasks[0].title, 'Evaluate Cloud Providers');
    assert.equal(masterRes.tasks[0].targetView, 'master-tasks');
  });

  it('should support object-keyed collections in store', () => {
    const objStore = {
      dailyTasks: {
        '2026-08-15': [{ title: 'Daily standup', dueDate: '2026-08-15' }]
      },
      calendarEvents: {
        '2026-08-15': [{ title: 'Quarterly Planning', startTime: '2026-08-15T09:00:00' }]
      },
      dailyNotes: {
        '2026-08-15': 'Discussed quarterly roadmap milestones.'
      }
    };
    const res = executeUniversalSearch('quarterly', objStore);
    assert.equal(res.totalMatches, 2);
    assert.equal(res.calendar.length, 1);
    assert.equal(res.notes.length, 1);
    assert.equal(res.notes[0].date, '2026-08-15');
  });
});
