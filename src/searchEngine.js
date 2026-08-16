/**
 * @file searchEngine.js
 * @description Franklin Planner Universal Search Engine.
 * Multi-entity cross-service indexing & searching for Google Calendar, Google Tasks, Daily Notes, and Monthly Index.
 */

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
        date: evt.startTime ? new Date(evt.startTime).toISOString().slice(0, 10) : '',
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
    const textMatch = (note.content || '').toLowerCase().includes(cleanQuery);
    if (textMatch) {
      // Extract snippet around query
      const idx = note.content.toLowerCase().indexOf(cleanQuery);
      const start = Math.max(0, idx - 20);
      const end = Math.min(note.content.length, idx + cleanQuery.length + 40);
      const snippet = '...' + note.content.substring(start, end).replace(/\n/g, ' ') + '...';

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
