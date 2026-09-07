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

/**
 * Decomposes an index heading (e.g. "#index [Architecture] System Design")
 * into its indexTopic and clean heading parts.
 * @param {string} [headingClean=''] Heading text with markdown # markers stripped.
 * @returns {{indexTopic: string, heading: string}}
 */
export function decomposeIndexHeading(headingClean = '') {
  if (!/#index|\[INDEX\]/i.test(headingClean)) {
    return { indexTopic: '', heading: headingClean };
  }
  let clean = headingClean.replace(/#index|\[INDEX\]/gi, '').trim();
  let indexTopic = 'General';
  const bracketMatch = clean.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (bracketMatch) {
    indexTopic = bracketMatch[1].trim();
    clean = bracketMatch[2].trim();
  } else if (clean.includes(':')) {
    const parts = clean.split(':');
    indexTopic = parts[0].trim();
    clean = parts.slice(1).join(':').trim();
  }
  return { indexTopic, heading: clean };
}

/**
 * Checks whether a heading string is a document date heading (e.g. "Aug 15, 2026").
 * @param {string} [headingClean=''] Heading text to test.
 * @returns {boolean}
 */
export function isDateHeading(headingClean = '') {
  const s = headingClean.replace(/^Daily Log\s*-\s*/i, '').trim();
  return /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?,\s*\d{4}$/i.test(s) ||
         /^\d{4}-\d{2}-\d{2}$/.test(s) ||
         /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?$/i.test(s);
}

/**
 * Parses daily note markdown text into structured continuous doc / note card sections,
 * reconciling with previous sections to preserve stable IDs, categories, and collapsed states.
 * @param {string} [noteText=''] Raw markdown string of daily notes.
 * @param {Array<object>} [prevSections=[]] Previously loaded sections to reconcile against.
 * @returns {{dateHeading: string, sections: Array<{id: string, indexTopic: string, heading: string, content: string, category: string, collapsed: boolean}>}}
 */
export function parseDailyNoteToSections(noteText = '', prevSections = []) {
  if (!noteText.trim() || noteText.startsWith('No notes recorded for')) {
    const defaultSections = [
      { id: 'nc_1', indexTopic: 'Architecture', heading: 'System Design', content: 'Finalized 3-column binder layout with Alpine.js and clean CSS.', category: 'Work', collapsed: false },
      { id: 'nc_2', indexTopic: 'Finance', heading: 'Budget Sync', content: '- Reviewed Q3 budget and Google Workspace API sync.\n- Approved GCP allocation.', category: 'Meeting', collapsed: false }
    ];
    if (prevSections && prevSections.length > 0) {
      defaultSections.forEach((ds, idx) => {
        if (prevSections[idx]) {
          ds.id = prevSections[idx].id || ds.id;
          ds.collapsed = !!prevSections[idx].collapsed;
          if (prevSections[idx].category) ds.category = prevSections[idx].category;
        }
      });
    }
    return { dateHeading: '', sections: defaultSections };
  }

  const lines = noteText.split('\n');
  const sections = [];
  let currentSection = null;
  let dateHeading = '';

  const inferCategory = (heading) => {
    const lower = (heading || '').toLowerCase();
    if (lower.includes('meeting')) return 'Meeting';
    if (lower.includes('finance') || lower.includes('decision')) return 'Decision';
    if (lower.includes('personal')) return 'Personal';
    if (lower.includes('project')) return 'Project';
    return 'Work';
  };

  lines.forEach((line) => {
    if (line.startsWith('### ') || line.startsWith('# ')) {
      const headingClean = line.replace(/^#+\s*/, '').trim();

      // Check if this is the top-level document date heading (e.g. "# Aug 15, 2026")
      if (isDateHeading(headingClean)) {
        if (!dateHeading) {
          dateHeading = headingClean;
        }
        return;
      }

      if (currentSection) {
        currentSection.content = currentSection.content.trimEnd();
        sections.push(currentSection);
      }

      const { indexTopic, heading } = decomposeIndexHeading(headingClean);
      const category = inferCategory(headingClean);

      currentSection = {
        id: '',
        indexTopic,
        heading,
        content: '',
        category,
        collapsed: false
      };
    } else {
      if (!currentSection) {
        if (!line.trim()) {
          // Ignore blank lines before the first heading
          return;
        }
        currentSection = {
          id: '',
          indexTopic: '',
          heading: 'General Notes',
          content: '',
          category: 'Work',
          collapsed: false
        };
      }
      currentSection.content += (currentSection.content ? '\n' : '') + line;
    }
  });

  if (currentSection) {
    currentSection.content = currentSection.content.trimEnd();
    sections.push(currentSection);
  }

  // Reconcile with prevSections to keep stable IDs, user-assigned categories, and collapse state
  const usedPrev = new Set();
  sections.forEach((sec, idx) => {
    let matchIdx = -1;
    // 1. Exact match at same index by heading & topic
    if (prevSections && prevSections[idx] &&
        !usedPrev.has(idx) &&
        prevSections[idx].heading === sec.heading &&
        (prevSections[idx].indexTopic || '') === (sec.indexTopic || '')) {
      matchIdx = idx;
    }
    // 2. Find match anywhere in prevSections by heading & topic
    if (matchIdx === -1 && prevSections) {
      matchIdx = prevSections.findIndex((p, pIdx) =>
        !usedPrev.has(pIdx) &&
        p.heading === sec.heading &&
        (p.indexTopic || '') === (sec.indexTopic || '')
      );
    }
    // 3. Fall back to same index if available
    if (matchIdx === -1 && prevSections && prevSections[idx] && !usedPrev.has(idx)) {
      matchIdx = idx;
    }

    if (matchIdx !== -1 && prevSections[matchIdx]) {
      usedPrev.add(matchIdx);
      const prev = prevSections[matchIdx];
      sec.id = prev.id || generateLocalId('nc');
      sec.category = prev.category || sec.category;
      sec.collapsed = typeof prev.collapsed === 'boolean' ? prev.collapsed : false;
      if (prev._activeLineIndex != null) sec._activeLineIndex = prev._activeLineIndex;
      if (prev._selectedLineRange) sec._selectedLineRange = prev._selectedLineRange;
    } else {
      sec.id = generateLocalId('nc');
    }
  });

  return { dateHeading, sections };
}

/**
 * Serializes structured continuous doc / note card sections back into clean markdown text.
 * Preserves the top-level date heading if provided, along with #index tags and H3 sections.
 * @param {Array<object>} [sections=[]] Array of section objects.
 * @param {string} [dateHeading=''] Optional top-level document date heading.
 * @returns {string} Serialized markdown string.
 */
export function serializeSectionsToDailyNote(sections = [], dateHeading = '') {
  const parts = [];
  if (dateHeading && dateHeading.trim()) {
    parts.push(`# ${dateHeading.trim()}`);
  }
  if (sections && sections.length > 0) {
    const sectionTexts = sections.map((s) => {
      const headingLine = s.indexTopic
        ? `#index [${s.indexTopic}] ${s.heading || 'Topic'}`
        : (s.heading || 'Topic');
      return `### ${headingLine}\n${s.content || ''}`;
    });
    parts.push(sectionTexts.join('\n\n'));
  }
  return parts.join('\n\n');
}
