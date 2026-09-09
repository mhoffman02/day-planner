/**
 * @file searchEngine.js
 * @description Day Planner Universal Search Engine.
 * Multi-entity cross-service indexing & searching for Google Calendar, Google Tasks, Daily Notes, and Monthly Index.
 */

import { getLocalDateStr } from './binderStore.js';
import { parseIndexEntriesFromNote } from './indexParser.js';

/**
 * Executes cross-service universal search query across calendar, tasks, notes, and index entries.
 * @param {string} [query=''] Search query string.
 * @param {{calendarEvents?: Array<object>, dailyTasks?: Array<object>, masterTasks?: Array<object>, dailyNotes?: Array<object>, indexEntries?: Array<object>}} [store={}] Data store containing entities to search.
 * @returns {{totalMatches: number, calendar: Array<object>, tasks: Array<object>, notes: Array<object>, index: Array<object>}} Grouped search result object.
 */
export function executeUniversalSearch(query = '', store = {}) {
  const cleanQuery = query.trim().toLowerCase();
  const results = {
    totalMatches: 0,
    calendar: [],
    tasks: [],
    notes: [],
    index: []
  };

  if (!cleanQuery) return results;

  const {
    calendarEvents = [],
    dailyTasks = [],
    masterTasks = [],
    dailyNotes = [],
    indexEntries = []
  } = store;

  // 1. Search Calendar Events
  calendarEvents.forEach(evt => {
    const titleMatch = (evt.title || '').toLowerCase().includes(cleanQuery);
    const locMatch = (evt.location || '').toLowerCase().includes(cleanQuery);
    const descMatch = (evt.description || '').toLowerCase().includes(cleanQuery);

    if (titleMatch || locMatch || descMatch) {
      results.calendar.push({
        type: 'calendar',
        title: evt.title,
        snippet: evt.location ? `Location: ${evt.location}` : (evt.description || 'Calendar Event'),
        date: evt.startTime ? getLocalDateStr(new Date(evt.startTime)) : '',
        targetView: 'daily',
        item: evt
      });
      results.totalMatches++;
    }
  });

  // 2. Search Tasks (Daily & Master)
  [...dailyTasks, ...masterTasks].forEach(task => {
    const titleMatch = (task.title || '').toLowerCase().includes(cleanQuery);
    const catMatch = (task.category || '').toLowerCase().includes(cleanQuery);

    if (titleMatch || catMatch) {
      results.tasks.push({
        type: 'task',
        title: task.title,
        snippet: task.category ? `Category: ${task.category}` : `Status: ${task.status || 'Open'}`,
        date: task.dueDate || '',
        targetView: task.dueDate ? 'daily' : 'master-tasks',
        item: task
      });
      results.totalMatches++;
    }
  });

  // 3. Search Daily Notes
  dailyNotes.forEach(note => {
    // Strip [[link:URL]]display text[[/link]] hyperlink markup down to its display text before
    // matching/snippeting, so raw markup tokens never leak into the search snippet (see the same
    // stripping pattern in src/app.js's plain-text rendering path).
    const plainContent = (note.content || '').replace(/\[\[link:[^\]]+\]\]([\s\S]*?)\[\[\/link\]\]/g, '$1');
    const textMatch = plainContent.toLowerCase().includes(cleanQuery);
    if (textMatch) {
      // Extract snippet around query
      const idx = plainContent.toLowerCase().indexOf(cleanQuery);
      const start = Math.max(0, idx - 20);
      const end = Math.min(plainContent.length, idx + cleanQuery.length + 40);
      const snippet = '...' + plainContent.substring(start, end).replace(/\n/g, ' ') + '...';

      results.notes.push({
        type: 'note',
        title: `Daily Note (${note.date})`,
        snippet,
        date: note.date,
        targetView: 'daily',
        item: note
      });
      results.totalMatches++;
    }
  });

  // 4. Search Monthly Index Entries
  indexEntries.forEach(idx => {
    const topicMatch = (idx.topic || '').toLowerCase().includes(cleanQuery);
    const summaryMatch = (idx.summary || '').toLowerCase().includes(cleanQuery);

    if (topicMatch || summaryMatch) {
      results.index.push({
        type: 'index',
        title: `[${idx.topic}] ${idx.summary}`,
        snippet: `Topic: ${idx.topic}`,
        date: idx.date,
        targetView: 'monthly-index',
        item: idx
      });
      results.totalMatches++;
    }
  });

  return results;
}

/**
 * Extracts search-relevant data (calendar events, non-blank daily notes, parsed index entries)
 * out of one month's `_prefetchMonth`/`getMonthData` overview payload, so a backfilled month can
 * be folded into the global search store without a second IndexedDB read or a second note-parse
 * pass elsewhere.
 * @param {Object<string, {calendarEvents?: Array<object>, noteContent?: string}>} [days={}]
 *   Per-day overview map keyed by "YYYY-MM-DD", as returned by `getMonthData`/`_prefetchMonth`.
 * @returns {{calendarEvents: Array<object>, dailyNotes: Array<{date: string, content: string}>, indexEntries: Array<object>}}
 */
export function extractMonthSearchData(days = {}) {
  const calendarEvents = [];
  const dailyNotes = [];
  const indexEntries = [];

  Object.entries(days || {}).forEach(([dateStr, day]) => {
    if (Array.isArray(day?.calendarEvents)) {
      calendarEvents.push(...day.calendarEvents);
    }
    const noteContent = day?.noteContent || '';
    if (noteContent.trim()) {
      dailyNotes.push({ date: dateStr, content: noteContent });
      indexEntries.push(...parseIndexEntriesFromNote(noteContent, dateStr));
    }
  });

  return { calendarEvents, dailyNotes, indexEntries };
}

/**
 * Assembles the full store `executeUniversalSearch()` searches against: the currently-loaded
 * "live" Alpine state for the selected day, plus whatever months have been backfilled into
 * IndexedDB so far. Cached-month notes/index/calendar entries for the selected date itself are
 * dropped, since the live state already covers that day and is the more current copy (an edit
 * made this session hasn't necessarily round-tripped into the cached month overview yet).
 * @param {{liveCalendarEvents?: Array<object>, dailyTasks?: Array<object>, masterTasks?: Array<object>,
 *   liveDailyNote?: string, selectedDate?: string, liveIndexRecords?: Array<object>,
 *   monthCache?: Map<string, {calendarEvents: Array<object>, dailyNotes: Array<object>, indexEntries: Array<object>}>}} [opts={}]
 * @returns {{calendarEvents: Array<object>, dailyTasks: Array<object>, masterTasks: Array<object>, dailyNotes: Array<object>, indexEntries: Array<object>}}
 */
export function buildGlobalSearchStore({
  liveCalendarEvents = [],
  dailyTasks = [],
  masterTasks = [],
  liveDailyNote = '',
  selectedDate = '',
  liveIndexRecords = [],
  monthCache = new Map()
} = {}) {
  const cachedCalendarEvents = [];
  const cachedDailyNotes = [];
  const cachedIndexEntries = [];

  monthCache.forEach((monthData) => {
    (monthData.calendarEvents || []).forEach(evt => {
      const evtDateStr = evt.startTime ? getLocalDateStr(new Date(evt.startTime)) : '';
      if (evtDateStr !== selectedDate) cachedCalendarEvents.push(evt);
    });
    (monthData.dailyNotes || []).forEach(note => {
      if (note.date !== selectedDate) cachedDailyNotes.push(note);
    });
    (monthData.indexEntries || []).forEach(entry => {
      if (entry.date !== selectedDate) cachedIndexEntries.push(entry);
    });
  });

  const dailyNotes = liveDailyNote.trim()
    ? [{ date: selectedDate, content: liveDailyNote }, ...cachedDailyNotes]
    : cachedDailyNotes;

  return {
    calendarEvents: [...liveCalendarEvents, ...cachedCalendarEvents],
    dailyTasks,
    masterTasks,
    dailyNotes,
    indexEntries: [...liveIndexRecords, ...cachedIndexEntries]
  };
}
