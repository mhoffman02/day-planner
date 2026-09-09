/**
 * @file searchEngine.test.js
 * @description Unit tests for universal search query execution across calendar, tasks, notes, and index records.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeUniversalSearch, extractMonthSearchData, buildGlobalSearchStore } from '../src/searchEngine.js';

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

  it('should strip [[link:URL]]...[[/link]] hyperlink markup from note snippets, keeping only the display text', () => {
    const searchRes = executeUniversalSearch('planning', {
      dailyNotes: [
        {
          date: '2026-08-20',
          content: 'Reviewed the [[link:https://docs.google.com/document/d/xyz]]Q4 planning doc[[/link]] before the meeting.'
        }
      ]
    });
    assert.equal(searchRes.notes.length, 1);
    const { snippet } = searchRes.notes[0];
    assert.ok(snippet.includes('Q4 planning doc'));
    assert.ok(!snippet.includes('[[link:'));
    assert.ok(!snippet.includes('[[/link]]'));
  });
});

describe('extractMonthSearchData', () => {
  it('flattens calendar events and parses index entries out of non-blank notes only', () => {
    const days = {
      '2026-07-01': {
        calendarEvents: [{ title: 'Standup', startTime: '2026-07-01T09:00:00' }],
        noteContent: '#index [Finance] Reviewed July budget'
      },
      '2026-07-02': {
        calendarEvents: [],
        noteContent: ''
      }
    };
    const result = extractMonthSearchData(days);
    assert.equal(result.calendarEvents.length, 1);
    assert.equal(result.dailyNotes.length, 1);
    assert.equal(result.dailyNotes[0].date, '2026-07-01');
    assert.equal(result.indexEntries.length, 1);
    assert.equal(result.indexEntries[0].topic, 'Finance');
  });

  it('tolerates an empty/missing days map', () => {
    assert.deepEqual(extractMonthSearchData(), { calendarEvents: [], dailyNotes: [], indexEntries: [] });
    assert.deepEqual(extractMonthSearchData({}), { calendarEvents: [], dailyNotes: [], indexEntries: [] });
  });
});

describe('buildGlobalSearchStore', () => {
  it('merges live selected-day state with backfilled month-cache data', () => {
    const monthCache = new Map([
      ['2026-06', {
        calendarEvents: [{ title: 'June planning', startTime: '2026-06-10T10:00:00' }],
        dailyNotes: [{ date: '2026-06-10', content: 'June note' }],
        indexEntries: [{ topic: 'Ops', summary: 'June index entry', date: '2026-06-10' }]
      }]
    ]);
    const store = buildGlobalSearchStore({
      liveCalendarEvents: [{ title: 'Today event', startTime: '2026-07-15T09:00:00' }],
      dailyTasks: [{ title: 'Task A' }],
      masterTasks: [{ title: 'Master A' }],
      liveDailyNote: 'Today note',
      selectedDate: '2026-07-15',
      liveIndexRecords: [{ topic: 'Today', summary: 'Today index', date: '2026-07-15' }],
      monthCache
    });

    assert.equal(store.calendarEvents.length, 2);
    assert.equal(store.dailyNotes.length, 2);
    assert.deepEqual(store.dailyNotes[0], { date: '2026-07-15', content: 'Today note' });
    assert.equal(store.indexEntries.length, 2);
    assert.equal(store.dailyTasks.length, 1);
    assert.equal(store.masterTasks.length, 1);
  });

  it('drops cached-month entries for the selected date so the live copy is not duplicated', () => {
    const monthCache = new Map([
      ['2026-07', {
        calendarEvents: [{ title: 'Stale cached event', startTime: '2026-07-15T09:00:00' }],
        dailyNotes: [{ date: '2026-07-15', content: 'Stale cached note' }],
        indexEntries: [{ topic: 'Stale', summary: 'Stale index', date: '2026-07-15' }]
      }]
    ]);
    const store = buildGlobalSearchStore({
      liveCalendarEvents: [],
      liveDailyNote: 'Fresh live note',
      selectedDate: '2026-07-15',
      monthCache
    });

    assert.equal(store.calendarEvents.length, 0);
    assert.equal(store.dailyNotes.length, 1);
    assert.equal(store.dailyNotes[0].content, 'Fresh live note');
    assert.equal(store.indexEntries.length, 0);
  });

  it('omits the selected-day placeholder note when liveDailyNote is blank', () => {
    const store = buildGlobalSearchStore({ liveDailyNote: '   ', selectedDate: '2026-07-15' });
    assert.equal(store.dailyNotes.length, 0);
  });
});
