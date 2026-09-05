/**
 * @file indexParser.js
 * @description Day Planner Index & Docs Parser Engine.
 * Scans daily note lines for #index or [INDEX] tags, extracts topic categories, highlights, and doc links.
 */

import { getLocalDateStr, generateLocalId } from './binderStore.js';

/**
 * Parses daily notes content string into structured index entries.
 * @param {string} [noteText=''] Full text of daily notes doc.
 * @param {string} [dateStr=''] Date string e.g. "2026-08-15".
 * @param {string} [docUrl=''] Google Doc URL or placeholder link.
 * @returns {Array<{id: string, date: string, topic: string, summary: string, docUrl: string, rawText: string}>} List of index record objects.
 */
export function parseIndexEntriesFromNote(noteText = '', dateStr = '', docUrl = '') {
  if (!noteText) return [];

  const lines = noteText.split('\n');
  const indexEntries = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.includes('#index') || trimmed.includes('[INDEX]')) {
      let cleanText = trimmed.replace('#index', '').replace('[INDEX]', '').trim();
      let topic = 'General';

      if (cleanText.includes(':')) {
        const parts = cleanText.split(':');
        topic = parts[0].trim();
        cleanText = parts.slice(1).join(':').trim();
      } else {
        const inlineBracket = cleanText.match(/\[([^\]]+)\]/);
        if (inlineBracket) {
          topic = inlineBracket[1].trim();
          cleanText = cleanText.replace(/\[([^\]]+)\]/g, '').trim();
        }
      }

      indexEntries.push({
        id: generateLocalId('idx', 7),
        date: dateStr || getLocalDateStr(),
        topic,
        summary: cleanText || trimmed,
        docUrl: docUrl || `#doc-${dateStr}`,
        rawText: trimmed
      });
    }
  });

  return indexEntries;
}

/**
 * Parses `#task [A1]`-style link lines from daily note text ("Paper-Planner method": jot a
 * note under a task's priority label, same as scribbling in a paper planner's margin, so a
 * note can be visually/programmatically cross-referenced back to the Task it's about).
 * Deliberately a sibling tag to `#index` rather than an extension of it — index entries and
 * task links serve different destinations (monthly index vs. a specific day's task list), and
 * conflating them would make `parseIndexEntriesFromNote` pull in unrelated task-link noise.
 * Keys on the Task's Priority code (e.g. "A1"), not a stable task id, since Google Tasks has no
 * stable id surfaced to note text — if a task's priority is later reassigned, an existing link
 * line stops matching until edited by hand; this is an accepted v1 limitation.
 * @param {string} [noteText=''] Full text of daily notes doc.
 * @returns {Array<{priority: string, summary: string, rawText: string}>} List of task-link entries.
 */
export function parseTaskLinksFromNote(noteText = '') {
  if (!noteText) return [];

  const lines = noteText.split('\n');
  const links = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    // Strip a leading markdown heading marker ("### "/"# ") so a link tag used as a note
    // card's heading (the Paper-Planner form) parses the same as one used inline.
    const dehashed = trimmed.replace(/^#+\s+/, '');
    if (/#task\b/i.test(dehashed) || /\[TASK\]/i.test(dehashed)) {
      const clean = dehashed.replace(/#task/i, '').replace(/\[TASK\]/i, '').trim();
      const match = clean.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (match) {
        links.push({
          priority: match[1].trim().toUpperCase(),
          summary: match[2].trim(),
          rawText: trimmed
        });
      }
    }
  });

  return links;
}

/**
 * Aggregates and sorts index entries chronologically (newest first or oldest first).
 * @param {Array<object>} [entriesList=[]] Array of index entry objects.
 * @param {boolean} [sortAscending=false] If true, sorts oldest to newest; otherwise newest to oldest.
 * @returns {Array<object>} Sorted array of index entry objects.
 */
export function aggregateIndexRecords(entriesList = [], sortAscending = false) {
  return [...entriesList].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    return sortAscending ? timeA - timeB : timeB - timeA;
  });
}
