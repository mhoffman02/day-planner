/**
 * @file indexParser.js
 * @description Franklin Planner Index & Docs Parser Engine.
 * Scans daily note lines for #index or [INDEX] tags, extracts topic categories, highlights, and doc links.
 */

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

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const hasIndexTag = /#index|\[INDEX\]/i.test(trimmed);
    if (hasIndexTag) {
      // Clean index tags from topic/summary
      let cleanText = trimmed.replace(/#index|\[INDEX\]/gi, '').trim();

      // Extract topic category inside brackets e.g. [Finance] or default to General
      let topic = 'General';
      const bracketMatch = cleanText.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (bracketMatch) {
        topic = bracketMatch[1].trim();
        cleanText = bracketMatch[2].trim();
      } else {
        const inlineBracket = cleanText.match(/\[([^\]]+)\]/);
        if (inlineBracket) {
          topic = inlineBracket[1].trim();
          cleanText = cleanText.replace(/\[([^\]]+)\]/g, '').trim();
        }
      }

      indexEntries.push({
        id: `idx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: dateStr || new Date().toISOString().slice(0, 10),
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
