/**
 * @file exportEngine.js
 * @description Day Planner One-Click Export & Backup Engine.
 * Generates formatted .json state snapshots and bundled .md markdown archives
 * covering tasks, appointments, daily notes, and #index records for local reading
 * and long-term offline archival.
 */

import { parseIndexEntriesFromNote } from './indexParser.js';
import { getLocalDateStr } from './binderStore.js';

/**
 * Normalizes and collects the full binder state from IndexedDB records and optional live memory state.
 * @param {object} params
 * @param {Array<object>} [params.dailyData=[]] All cached daily records from IndexedDB.
 * @param {Array<object>} [params.masterTasks=[]] Master tasks array.
 * @param {Array<object>} [params.monthlyNotes=[]] Monthly notes array.
 * @param {object|null} [params.currentDaily=null] Currently active daily data from memory to override/supplement.
 * @returns {{
 *   version: number,
 *   exportedAt: string,
 *   stats: { totalTasks: number, totalAppointments: number, totalNotes: number, totalIndexRecords: number },
 *   tasks: Array<object>,
 *   appointments: Array<object>,
 *   notes: Array<{date: string, content: string}>,
 *   indexRecords: Array<object>
 * }}
 */
export function collectFullBinderState({
  dailyData = [],
  masterTasks = [],
  monthlyNotes = [],
  currentDaily = null
} = {}) {
  const dayMap = new Map();

  for (const day of dailyData) {
    if (day && day.dateStr) {
      dayMap.set(day.dateStr, {
        dateStr: day.dateStr,
        tasks: Array.isArray(day.tasks) ? [...day.tasks] : [],
        calendarEvents: Array.isArray(day.calendarEvents) ? [...day.calendarEvents] : [],
        noteContent: day.noteContent || ''
      });
    }
  }

  if (currentDaily && currentDaily.dateStr) {
    dayMap.set(currentDaily.dateStr, {
      dateStr: currentDaily.dateStr,
      tasks: Array.isArray(currentDaily.tasks) ? [...currentDaily.tasks] : [],
      calendarEvents: Array.isArray(currentDaily.calendarEvents) ? [...currentDaily.calendarEvents] : [],
      noteContent: currentDaily.noteContent || ''
    });
  }

  const sortedDays = Array.from(dayMap.values()).sort((a, b) => a.dateStr.localeCompare(b.dateStr));

  const tasks = [];
  const appointments = [];
  const notes = [];
  const indexRecords = [];

  // Master tasks
  for (const mt of masterTasks) {
    tasks.push({
      ...mt,
      isMaster: true
    });
  }

  // Daily records
  for (const day of sortedDays) {
    const { dateStr, tasks: dayTasks, calendarEvents, noteContent } = day;

    for (const t of dayTasks) {
      tasks.push({
        ...t,
        date: dateStr,
        isMaster: false
      });
    }

    for (const evt of calendarEvents) {
      appointments.push({
        ...evt,
        date: dateStr
      });
    }

    if (noteContent && noteContent.trim()) {
      notes.push({
        date: dateStr,
        content: noteContent
      });

      const parsedIdx = parseIndexEntriesFromNote(noteContent, dateStr);
      indexRecords.push(...parsedIdx);
    }
  }

  // Also scan monthlyNotes for any additional index entries if present
  for (const mn of monthlyNotes) {
    if (mn && mn.days) {
      for (const [dStr, dayObj] of Object.entries(mn.days)) {
        if (!dayMap.has(dStr) && dayObj && dayObj.raw) {
          notes.push({ date: dStr, content: dayObj.raw });
          const parsed = parseIndexEntriesFromNote(dayObj.raw, dStr);
          indexRecords.push(...parsed);
        }
      }
    }
  }

  // Deduplicate index records by date + topic + summary
  const seenIdx = new Set();
  const dedupedIndexRecords = [];
  for (const idx of indexRecords) {
    const key = `${idx.date}|${idx.topic}|${idx.summary}`;
    if (!seenIdx.has(key)) {
      seenIdx.add(key);
      dedupedIndexRecords.push(idx);
    }
  }
  dedupedIndexRecords.sort((a, b) => a.date.localeCompare(b.date));

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    stats: {
      totalTasks: tasks.length,
      totalAppointments: appointments.length,
      totalNotes: notes.length,
      totalIndexRecords: dedupedIndexRecords.length
    },
    tasks,
    appointments,
    notes,
    indexRecords: dedupedIndexRecords
  };
}

/**
 * Formats full binder state as a formatted JSON string snapshot.
 * @param {object} binderState Full binder state returned by collectFullBinderState.
 * @returns {string} Pretty-printed JSON string.
 */
export function exportBinderAsJson(binderState) {
  return JSON.stringify(binderState, null, 2);
}

/**
 * Converts a binder task status glyph to human-readable markdown checkbox.
 * @param {string} status Status glyph e.g. '✓', '•', 'X', '→', 'D/✓'.
 * @returns {string}
 */
function statusToCheckbox(status) {
  if (status === '✓' || status === 'D/✓') return '[x]';
  if (status === 'X') return '[-]';
  if (status === '→') return '[>]';
  return '[ ]';
}

/**
 * Bundles full binder state into a clean Markdown archive for offline reading and long-term archival.
 * @param {object} binderState Full binder state returned by collectFullBinderState.
 * @returns {string} Markdown archive document string.
 */
export function exportBinderAsMarkdown(binderState) {
  const lines = [];

  lines.push('# Day Planner Binder Archive');
  lines.push('');
  lines.push(`- **Export Date**: ${binderState.exportedAt || new Date().toISOString()}`);
  lines.push(`- **Total Tasks**: ${binderState.stats?.totalTasks ?? binderState.tasks?.length ?? 0}`);
  lines.push(`- **Total Appointments**: ${binderState.stats?.totalAppointments ?? binderState.appointments?.length ?? 0}`);
  lines.push(`- **Total Notes**: ${binderState.stats?.totalNotes ?? binderState.notes?.length ?? 0}`);
  lines.push(`- **Total #index Records**: ${binderState.stats?.totalIndexRecords ?? binderState.indexRecords?.length ?? 0}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 1. #index Decision Registry
  lines.push('## 1. #index Decision & Topic Registry');
  lines.push('');
  if (!binderState.indexRecords || binderState.indexRecords.length === 0) {
    lines.push('*No #index records found.*');
  } else {
    lines.push('| Date | Topic | Summary |');
    lines.push('| :--- | :--- | :--- |');
    for (const rec of binderState.indexRecords) {
      const safeTopic = (rec.topic || 'General').replace(/\|/g, '\\|');
      const safeSummary = (rec.summary || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(`| ${rec.date} | ${safeTopic} | ${safeSummary} |`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // 2. Master Tasks
  const masterTasks = (binderState.tasks || []).filter(t => t.isMaster);
  lines.push('## 2. Master Task List');
  lines.push('');
  if (masterTasks.length === 0) {
    lines.push('*No master tasks found.*');
  } else {
    for (const t of masterTasks) {
      const chk = statusToCheckbox(t.status);
      const cat = t.category ? ` *(${t.category})*` : '';
      lines.push(`- ${chk} ${t.title || '(untitled)'}${cat}`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // 3. Daily Records (Tasks, Appointments, Notes)
  lines.push('## 3. Daily Planner Records');
  lines.push('');

  // Group daily tasks and appointments by date
  const dailyTasks = (binderState.tasks || []).filter(t => !t.isMaster);
  const appointmentsByDate = new Map();
  for (const evt of binderState.appointments || []) {
    const d = evt.date || (evt.startTime ? evt.startTime.slice(0, 10) : 'Undated');
    if (!appointmentsByDate.has(d)) appointmentsByDate.set(d, []);
    appointmentsByDate.get(d).push(evt);
  }

  const tasksByDate = new Map();
  for (const t of dailyTasks) {
    const d = t.date || t.dueDate || 'Undated';
    if (!tasksByDate.has(d)) tasksByDate.set(d, []);
    tasksByDate.get(d).push(t);
  }

  const notesByDate = new Map();
  for (const n of binderState.notes || []) {
    if (n.date) notesByDate.set(n.date, n.content);
  }

  const allDates = new Set([
    ...tasksByDate.keys(),
    ...appointmentsByDate.keys(),
    ...notesByDate.keys()
  ]);
  const sortedDates = Array.from(allDates).sort();

  if (sortedDates.length === 0) {
    lines.push('*No daily records found.*');
  } else {
    for (const d of sortedDates) {
      lines.push(`### ${d}`);
      lines.push('');

      // Appointments
      const evts = appointmentsByDate.get(d) || [];
      lines.push('#### Appointments');
      if (evts.length === 0) {
        lines.push('- *No appointments scheduled.*');
      } else {
        for (const evt of evts) {
          const start = evt.startTime ? evt.startTime.slice(11, 16) : '';
          const end = evt.endTime ? evt.endTime.slice(11, 16) : '';
          const timeSpan = start && end ? `${start}–${end}: ` : (start ? `${start}: ` : '');
          const loc = evt.location ? ` @ ${evt.location}` : '';
          lines.push(`- ${timeSpan}${evt.title || '(untitled)'}${loc}`);
        }
      }
      lines.push('');

      // Tasks
      const dayTasksList = tasksByDate.get(d) || [];
      lines.push('#### Tasks');
      if (dayTasksList.length === 0) {
        lines.push('- *No tasks for this day.*');
      } else {
        for (const t of dayTasksList) {
          const chk = statusToCheckbox(t.status);
          const cat = t.category ? ` *(${t.category})*` : '';
          lines.push(`- ${chk} ${t.title || '(untitled)'}${cat}`);
        }
      }
      lines.push('');

      // Notes
      const noteContent = notesByDate.get(d);
      if (noteContent && noteContent.trim()) {
        lines.push('#### Daily Notes');
        lines.push('');
        lines.push(noteContent.trim());
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Triggers a browser file download from a string payload.
 * Safely no-ops in non-browser (e.g. Node test) environments.
 * @param {string} content Text content to download.
 * @param {string} filename Output file name.
 * @param {string} mimeType Content MIME type.
 * @returns {boolean} True if download was initiated.
 */
export function downloadFile(content, filename, mimeType = 'application/json') {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof globalThis.Blob === 'undefined') {
    return false;
  }
  try {
    const blob = new globalThis.Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('downloadFile failed:', err);
    return false;
  }
}

/**
 * Downloads full binder state as a formatted JSON snapshot file.
 * @param {object} binderState Normalized binder state.
 * @param {string} [filename] Optional custom filename.
 * @returns {boolean}
 */
export function downloadBinderJson(binderState, filename = null) {
  const dateStr = getLocalDateStr();
  const name = filename || `day-planner-backup-${dateStr}.json`;
  const jsonContent = exportBinderAsJson(binderState);
  return downloadFile(jsonContent, name, 'application/json');
}

/**
 * Downloads full binder state as a formatted Markdown archive file.
 * @param {object} binderState Normalized binder state.
 * @param {string} [filename] Optional custom filename.
 * @returns {boolean}
 */
export function downloadBinderMarkdown(binderState, filename = null) {
  const dateStr = getLocalDateStr();
  const name = filename || `day-planner-archive-${dateStr}.md`;
  const mdContent = exportBinderAsMarkdown(binderState);
  return downloadFile(mdContent, name, 'text/markdown;charset=utf-8');
}
