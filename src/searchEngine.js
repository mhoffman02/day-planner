/**
 * @file searchEngine.js
 * @description Franklin Planner Universal Search Engine.
 * Multi-entity cross-service indexing & searching for Google Calendar, Google Tasks, Daily Notes, and Monthly Index.
 */

/**
 * Extracts a local YYYY-MM-DD date string without using .toISOString() to avoid UTC shift bugs.
 * @param {string|Date} [dateVal] Input date object or string.
 * @returns {string} Date string formatted as YYYY-MM-DD, or empty string if invalid.
 */
function extractLocalDateStr(dateVal) {
  if (!dateVal) return '';
  if (typeof dateVal === 'string') {
    const match = dateVal.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(dateVal);
    if (isNaN(parsed.getTime())) return '';
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    const y = dateVal.getFullYear();
    const m = String(dateVal.getMonth() + 1).padStart(2, '0');
    const d = String(dateVal.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

/**
 * Normalizes input list which could be an Array or an Object keyed by date.
 * @param {Array<object>|object} [input] Input collection.
 * @returns {Array<object>} Flat array of items.
 */
function normalizeCollection(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input === 'object') return Object.values(input).flat();
  return [];
}

/**
 * Flattens grouped search results into a sequential array for unified navigation.
 * @param {{calendar?: Array<object>, tasks?: Array<object>, notes?: Array<object>, index?: Array<object>}} [results={}] Grouped search results.
 * @returns {Array<object>} Flattened array of search result items.
 */
export function flattenSearchResults(results = {}) {
  if (!results) return [];
  return [
    ...(results.calendar || []),
    ...(results.tasks || []),
    ...(results.notes || []),
    ...(results.index || [])
  ];
}

/**
 * Executes cross-service universal search query across calendar, tasks, notes, and index entries.
 * @param {string} [query=''] Search query string.
 * @param {{calendarEvents?: (Array<object>|object), dailyTasks?: (Array<object>|object), masterTasks?: Array<object>, dailyNotes?: (Array<object>|object), indexEntries?: Array<object>}} [store={}] Data store containing entities to search.
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
    calendarEvents,
    dailyTasks,
    masterTasks = [],
    dailyNotes,
    indexEntries = []
  } = store;

  // 1. Search Calendar Events
  normalizeCollection(calendarEvents).forEach(evt => {
    const titleMatch = (evt.title || '').toLowerCase().includes(cleanQuery);
    const locMatch = (evt.location || '').toLowerCase().includes(cleanQuery);
    const descMatch = (evt.description || '').toLowerCase().includes(cleanQuery);

    if (titleMatch || locMatch || descMatch) {
      const evtDate = evt.date || extractLocalDateStr(evt.startTime);
      results.calendar.push({
        type: 'calendar',
        title: evt.title || 'Untitled Event',
        snippet: evt.location ? `Location: ${evt.location}` : (evt.description || 'Calendar Event'),
        date: evtDate,
        targetView: 'daily',
        item: evt
      });
      results.totalMatches++;
    }
  });

  // 2. Search Tasks (Daily & Master)
  const allTasks = [...normalizeCollection(dailyTasks), ...normalizeCollection(masterTasks)];
  allTasks.forEach(task => {
    const titleMatch = (task.title || '').toLowerCase().includes(cleanQuery);
    const catMatch = (task.category || '').toLowerCase().includes(cleanQuery);
    const notesMatch = (task.notes || '').toLowerCase().includes(cleanQuery);

    if (titleMatch || catMatch || notesMatch) {
      const isMaster = !task.dueDate || task.master;
      results.tasks.push({
        type: 'task',
        title: task.title || 'Untitled Task',
        snippet: task.category ? `Category: ${task.category}` : (task.notes ? `Notes: ${task.notes}` : `Status: ${task.status || 'Open'}`),
        date: task.dueDate || '',
        targetView: isMaster ? 'master-tasks' : 'daily',
        item: task
      });
      results.totalMatches++;
    }
  });

  // 3. Search Daily Notes
  let normalizedNotes = [];
  if (Array.isArray(dailyNotes)) {
    normalizedNotes = dailyNotes.map(n => ({
      date: n.date || '',
      content: n.content || n.noteContent || ''
    }));
  } else if (dailyNotes && typeof dailyNotes === 'object') {
    normalizedNotes = Object.entries(dailyNotes).map(([date, val]) => ({
      date,
      content: typeof val === 'string' ? val : (val?.content || val?.noteContent || '')
    }));
  }

  normalizedNotes.forEach(note => {
    // Strip [[link:URL]]display text[[/link]] hyperlink markup down to display text before matching/snippeting
    const text = (note.content || '').replace(/\[\[link:[^\]]+\]\]([\s\S]*?)\[\[\/link\]\]/g, '$1');
    if (text.toLowerCase().includes(cleanQuery)) {
      const idx = text.toLowerCase().indexOf(cleanQuery);
      const start = Math.max(0, idx - 20);
      const end = Math.min(text.length, idx + cleanQuery.length + 40);
      const snippet = '...' + text.substring(start, end).replace(/\n/g, ' ') + '...';

      results.notes.push({
        type: 'note',
        title: `Daily Note (${note.date || 'Undated'})`,
        snippet,
        date: note.date || '',
        targetView: 'daily',
        item: note
      });
      results.totalMatches++;
    }
  });

  // 4. Search Monthly Index Entries
  normalizeCollection(indexEntries).forEach(idx => {
    const cleanTopic = (idx.topic || 'General').replace(/^###\s*/, '');
    const cleanSummary = (idx.summary || '').replace(/^###\s*/, '');
    const topicMatch = cleanTopic.toLowerCase().includes(cleanQuery);
    const summaryMatch = cleanSummary.toLowerCase().includes(cleanQuery);

    if (topicMatch || summaryMatch) {
      results.index.push({
        type: 'index',
        title: `[${cleanTopic}] ${cleanSummary}`,
        snippet: `Topic: ${cleanTopic}`,
        date: idx.date || '',
        targetView: 'monthly-index',
        item: idx
      });
      results.totalMatches++;
    }
  });

  return results;
}
