/**
 * @file searchEngine.test.js
 * @description Unit tests for universal search query execution across calendar, tasks, notes, and index records.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeUniversalSearch,
  flattenSearchResults,
  parseArchiveNoteHeading,
  extractSearchSnippet,
  mergeArchiveSearchResults
} from '../src/searchEngine.js';

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
    assert.equal(searchRes.archive.length, 0);
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

  describe('Deep Archive Search Helpers', () => {
    it('parseArchiveNoteHeading should extract dates from various heading formats', () => {
      // 1. Long formatted date with weekday
      assert.equal(
        parseArchiveNoteHeading('Day Planner - Sunday, August 16, 2026'),
        '2026-08-16'
      );
      assert.equal(
        parseArchiveNoteHeading('Day Planner - Friday, September 25, 2026'),
        '2026-09-25'
      );

      // 2. ISO dates in headings
      assert.equal(
        parseArchiveNoteHeading('## 2026-08-16'),
        '2026-08-16'
      );
      assert.equal(
        parseArchiveNoteHeading('Day Planner - 2026-10-31'),
        '2026-10-31'
      );

      // 3. Fallback to docTitle containing Month and Year
      assert.equal(
        parseArchiveNoteHeading('General Topics', 'Day Planner Notes - August 2026'),
        '2026-08-01'
      );
      assert.equal(
        parseArchiveNoteHeading('', 'Day Planner Notes - 2026-12'),
        '2026-12-01'
      );

      // 4. Undetermined returns empty string
      assert.equal(parseArchiveNoteHeading('Notes', 'Misc Document'), '');
    });

    it('extractSearchSnippet should generate clean contextual excerpts and strip link markup', () => {
      const text = 'Before [[link:https://google.com]]Google Workspace[[/link]] integration was completed, we evaluated requirements.';
      const snippet = extractSearchSnippet(text, 'Workspace');
      assert.ok(snippet.includes('Google Workspace'));
      assert.ok(!snippet.includes('[[link:'));
      assert.ok(!snippet.includes('[[/link]]'));

      const plainText = 'The quarterly roadmap defines our key objectives for Q3 and Q4 milestones.';
      const plainSnippet = extractSearchSnippet(plainText, 'objectives');
      assert.ok(plainSnippet.includes('objectives'));
    });

    it('mergeArchiveSearchResults should merge archive items and deduplicate with local notes', () => {
      const localResults = {
        totalMatches: 2,
        calendar: [],
        tasks: [{ title: 'Task 1' }],
        notes: [{ date: '2026-08-15', snippet: 'Local note snippet' }],
        index: []
      };

      const archiveItems = [
        {
          date: '2026-08-15', // Same date as local note: should be skipped to prevent duplicate
          snippet: 'Archive snippet for 2026-08-15',
          docName: 'Day Planner Notes - August 2026'
        },
        {
          date: '2026-07-20',
          snippet: 'Historical snippet for July 20',
          docName: 'Day Planner Notes - July 2026'
        },
        {
          date: '2026-06-10',
          snippet: 'Historical snippet for June 10',
          docName: 'Day Planner Notes - June 2026'
        }
      ];

      const merged = mergeArchiveSearchResults(localResults, archiveItems);
      assert.equal(merged.archive.length, 2);
      assert.equal(merged.archive[0].date, '2026-07-20');
      assert.equal(merged.archive[1].date, '2026-06-10');
      assert.equal(merged.totalMatches, 4); // 1 task + 1 local note + 2 archive notes
    });

    it('executeUniversalSearch should process archiveNotes if passed in store and flattenSearchResults should include them', () => {
      const storeWithArchive = {
        ...sampleStore,
        archiveNotes: [
          {
            date: '2026-07-15',
            heading: 'Day Planner - Wednesday, July 15, 2026',
            content: 'Discussed Q3 strategy kickoff and budget allocation.',
            docName: 'Day Planner Notes - July 2026'
          }
        ]
      };

      const res = executeUniversalSearch('strategy', storeWithArchive);
      assert.equal(res.archive.length, 1);
      assert.equal(res.archive[0].date, '2026-07-15');
      assert.equal(res.archive[0].type, 'archive');

      const flat = flattenSearchResults(res);
      assert.equal(flat.length, 1);
      assert.equal(flat[0].type, 'archive');
    });
  });
});

