/**
 * @file searchEngine.js
 * @description Day Planner Universal Search Engine.
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
    ...(results.index || []),
    ...(results.archive || [])
  ];
}

/**
 * Executes cross-service universal search query across calendar, tasks, notes, and index entries.
 * @param {string} [query=''] Search query string.
 * @param {{calendarEvents?: (Array<object>|object), dailyTasks?: (Array<object>|object), masterTasks?: Array<object>, dailyNotes?: (Array<object>|object), indexEntries?: Array<object>, archiveNotes?: Array<object>}} [store={}] Data store containing entities to search.
 * @returns {{totalMatches: number, calendar: Array<object>, tasks: Array<object>, notes: Array<object>, index: Array<object>, archive: Array<object>}} Grouped search result object.
 */
export function executeUniversalSearch(query = '', store = {}) {
  const cleanQuery = query.trim().toLowerCase();
  const results = {
    totalMatches: 0,
    calendar: [],
    tasks: [],
    notes: [],
    index: [],
    archive: []
  };

  if (!cleanQuery) return results;

  const {
    calendarEvents,
    dailyTasks,
    masterTasks = [],
    dailyNotes,
    indexEntries = [],
    archiveNotes = []
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

  // 5. Search Historical Archive Notes (if passed in store)
  normalizeCollection(archiveNotes).forEach(arch => {
    const rawContent = arch.content || arch.snippet || '';
    const text = rawContent.replace(/\[\[link:[^\]]+\]\]([\s\S]*?)\[\[\/link\]\]/g, '$1');
    const title = arch.title || '';
    const heading = arch.heading || '';

    if (text.toLowerCase().includes(cleanQuery) || title.toLowerCase().includes(cleanQuery) || heading.toLowerCase().includes(cleanQuery)) {
      const dateStr = arch.date || parseArchiveNoteHeading(heading || title, arch.docName || '');
      const snippet = arch.snippet || extractSearchSnippet(text, cleanQuery);

      results.archive.push({
        type: 'archive',
        title: arch.title || `Archive: Daily Note (${dateStr || 'Undated'})`,
        snippet,
        date: dateStr || '',
        targetView: 'daily',
        docName: arch.docName || '',
        docUrl: arch.docUrl || '',
        item: arch
      });
      results.totalMatches++;
    }
  });

  return results;
}

/**
 * Parses date string (YYYY-MM-DD) from a monthly note day heading or document title.
 * Handles ISO dates (YYYY-MM-DD), English month names ("Sunday, August 16, 2026"),
 * and document titles ("Day Planner Notes - August 2026").
 * @param {string} [heading=''] Section heading text or paragraph text.
 * @param {string} [docTitle=''] Parent document title.
 * @returns {string} Formatted date string (YYYY-MM-DD), or empty string if undetermined.
 */
export function parseArchiveNoteHeading(heading = '', docTitle = '') {
  const monthMap = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12'
  };

  const text = (heading || '').trim();

  // 1. Look for ISO date: YYYY-MM-DD
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // 2. Look for Month Day, Year (e.g. "Sunday, August 16, 2026" or "August 16, 2026")
  const monthDayYearMatch = text.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (monthDayYearMatch) {
    const mName = monthDayYearMatch[1].toLowerCase();
    if (monthMap[mName]) {
      const y = monthDayYearMatch[3];
      const m = monthMap[mName];
      const d = String(monthDayYearMatch[2]).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  // 3. Fall back to docTitle if it contains Year and Month
  const titleText = (docTitle || '').trim();
  const titleIsoMatch = titleText.match(/\b(\d{4})-(\d{2})\b/);
  if (titleIsoMatch) {
    return `${titleIsoMatch[1]}-${titleIsoMatch[2]}-01`;
  }
  const titleMonthMatch = titleText.match(/([A-Za-z]+)\s+(\d{4})/);
  if (titleMonthMatch) {
    const tmName = titleMonthMatch[1].toLowerCase();
    if (monthMap[tmName]) {
      return `${titleMonthMatch[2]}-${monthMap[tmName]}-01`;
    }
  }

  return '';
}

/**
 * Extracts a contextual snippet highlighting the search term within text.
 * Strips bracketed link markup down to plain text before slicing.
 * @param {string} [content=''] Text content to excerpt.
 * @param {string} [query=''] Search query term.
 * @param {number} [maxLength=80] Maximum length of excerpt.
 * @returns {string} Clean excerpt snippet with ellipsis.
 */
export function extractSearchSnippet(content = '', query = '', maxLength = 80) {
  if (!content) return '';
  const cleanContent = content.replace(/\[\[link:[^\]]+\]\]([\s\S]*?)\[\[\/link\]\]/g, '$1');
  if (!query) {
    return cleanContent.length > maxLength
      ? cleanContent.substring(0, maxLength).replace(/\n/g, ' ') + '...'
      : cleanContent.replace(/\n/g, ' ');
  }

  const lowerContent = cleanContent.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerContent.indexOf(lowerQuery);

  if (idx === -1) {
    return cleanContent.length > maxLength
      ? cleanContent.substring(0, maxLength).replace(/\n/g, ' ') + '...'
      : cleanContent.replace(/\n/g, ' ');
  }

  const start = Math.max(0, idx - 25);
  const end = Math.min(cleanContent.length, idx + query.length + 45);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < cleanContent.length ? '...' : '';
  return (prefix + cleanContent.substring(start, end).replace(/\n/g, ' ') + suffix).trim();
}

/**
 * Merges asynchronous archive search matches into an existing search results object,
 * deduplicating entries if a note for that date is already present in local notes.
 * @param {{totalMatches: number, calendar?: Array<object>, tasks?: Array<object>, notes?: Array<object>, index?: Array<object>, archive?: Array<object>}} searchResults
 * @param {Array<object>} [archiveItems=[]] Deep archive search results from backend.
 * @returns {{totalMatches: number, calendar: Array<object>, tasks: Array<object>, notes: Array<object>, index: Array<object>, archive: Array<object>}}
 */
export function mergeArchiveSearchResults(searchResults = {}, archiveItems = []) {
  const merged = {
    calendar: searchResults.calendar || [],
    tasks: searchResults.tasks || [],
    notes: searchResults.notes || [],
    index: searchResults.index || [],
    archive: []
  };

  const localNoteDates = new Set(merged.notes.map(n => n.date).filter(Boolean));
  const seenArchiveKeys = new Set();

  (archiveItems || []).forEach(item => {
    if (!item) return;
    // Deduplicate against local notes on the exact same date
    if (item.date && localNoteDates.has(item.date)) {
      return;
    }
    const key = `${item.date || ''}_${item.snippet || ''}`;
    if (!seenArchiveKeys.has(key)) {
      seenArchiveKeys.add(key);
      merged.archive.push({
        type: 'archive',
        title: item.title || `Archive: Daily Note (${item.date || 'Undated'})`,
        snippet: item.snippet || '',
        date: item.date || '',
        targetView: item.targetView || 'daily',
        docName: item.docName || '',
        docUrl: item.docUrl || '',
        item
      });
    }
  });

  merged.totalMatches = merged.calendar.length + merged.tasks.length + merged.notes.length + merged.index.length + merged.archive.length;
  return merged;
}

