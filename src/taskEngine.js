/**
 * @file taskEngine.js
 * @description Day Planner Task Engine.
 * Handles task priorities (A1-C9), status codes, task ordering, and "Move to Today" transfer logic.
 */

import { getLocalDateStr } from './binderStore.js';

/**
 * Task status code symbols dictionary.
 * @type {Record<string, string>}
 */
export const TASK_STATUSES = {
  OPEN: '•',
  COMPLETED: '✓',
  FORWARDED: '→',
  CANCELED: 'X',
  DELEGATED: 'G/✓'
};

/**
 * List of status codes for status cycling.
 * @type {Array<string>}
 */
export const STATUS_LIST = ['•', '✓', '→', 'X', 'G/✓'];

/**
 * Parses a task title that may contain a priority prefix like [A1] or [B3].
 * @param {string} [rawTitle=''] Raw task title string.
 * @returns {{priorityGroup: 'A'|'B'|'C'|null, sequence: number|null, priorityCode: string|null, cleanTitle: string}} Parsed task title details.
 */
export function parseTaskTitle(rawTitle = '') {
  if (!rawTitle) {
    return { priorityGroup: null, sequence: null, priorityCode: null, cleanTitle: '' };
  }
  
  const match = rawTitle.match(/^\[([A-C])([1-9])\]\s*(.*)$/i);
  if (match) {
    const priorityGroup = match[1].toUpperCase();
    const sequence = parseInt(match[2], 10);
    return {
      priorityGroup,
      sequence,
      priorityCode: `${priorityGroup}${sequence}`,
      cleanTitle: match[3].trim()
    };
  }

  return {
    priorityGroup: null,
    sequence: null,
    priorityCode: null,
    cleanTitle: rawTitle.trim()
  };
}

/**
 * Formats task title with priority prefix.
 * @param {string|null} priorityGroup Priority group letter ('A', 'B', or 'C').
 * @param {number|null} sequence Priority sequence number (1-9).
 * @param {string} cleanTitle Clean task title without prefix.
 * @returns {string} Formatted task title.
 */
export function formatTaskTitle(priorityGroup, sequence, cleanTitle) {
  const trimmed = (cleanTitle || '').trim();
  if (priorityGroup && sequence) {
    return `[${priorityGroup.toUpperCase()}${sequence}] ${trimmed}`;
  }
  return trimmed;
}

/**
 * Cycle to the next task status code in sequence.
 * @param {string} currentStatus Current status code symbol.
 * @returns {string} Next status code symbol.
 */
export function getNextStatus(currentStatus) {
  const idx = STATUS_LIST.indexOf(currentStatus);
  if (idx === -1 || idx === STATUS_LIST.length - 1) {
    return STATUS_LIST[0];
  }
  return STATUS_LIST[idx + 1];
}

/**
 * Sorts array of task objects by priority (A1, A2... B1... C9... Unprioritized).
 * @param {Array<object>} [tasks=[]] Array of task objects to sort.
 * @returns {Array<object>} New array of sorted task objects.
 */
export function sortTasks(tasks = []) {
  return [...tasks].sort((a, b) => {
    const parseA = parseTaskTitle(a.title);
    const parseB = parseTaskTitle(b.title);

    if (parseA.priorityGroup && !parseB.priorityGroup) return -1;
    if (!parseA.priorityGroup && parseB.priorityGroup) return 1;

    if (parseA.priorityGroup && parseB.priorityGroup) {
      if (parseA.priorityGroup !== parseB.priorityGroup) {
        return parseA.priorityGroup.localeCompare(parseB.priorityGroup);
      }
      if (parseA.sequence !== parseB.sequence) {
        return parseA.sequence - parseB.sequence;
      }
    }

    return (parseA.cleanTitle || '').localeCompare(parseB.cleanTitle || '');
  });
}

/**
 * Finds next available sequence integer for a priority group ('A', 'B', or 'C').
 * @param {Array<object>} [tasks=[]] Array of existing task objects.
 * @param {string} [priorityGroup='A'] Target priority group letter.
 * @returns {number} Next available sequence number (1 to 9).
 */
export function getNextSequence(tasks = [], priorityGroup = 'A') {
  const pGroup = priorityGroup.toUpperCase();
  const existingSeqs = tasks
    .map(t => parseTaskTitle(t.title))
    .filter(p => p.priorityGroup === pGroup && p.sequence !== null)
    .map(p => p.sequence);

  for (let seq = 1; seq <= 9; seq++) {
    if (!existingSeqs.includes(seq)) {
      return seq;
    }
  }
  return 9; // Cap at 9
}

/**
 * Transfers a monthly master task to the daily task list for today with assigned priority.
 * @param {object} masterTask Source master task object.
 * @param {Array<object>} [existingDailyTasks=[]] Current daily tasks list.
 * @param {string} [targetPriorityGroup='A'] Priority group letter to assign ('A', 'B', or 'C').
 * @param {string} [todayDateStr] Target date string in YYYY-MM-DD format (defaults to current local date).
 * @returns {{id: string, title: string, status: string, dueDate: string, category: string, sourceMasterId: string|null}} Newly created daily task object.
 */
export function transferMasterTaskToToday(masterTask, existingDailyTasks = [], targetPriorityGroup = 'A', todayDateStr = getLocalDateStr()) {
  const cleanTitle = parseTaskTitle(masterTask.title).cleanTitle || masterTask.title || 'Untitled Task';
  const sequence = getNextSequence(existingDailyTasks, targetPriorityGroup);
  const formattedTitle = formatTaskTitle(targetPriorityGroup, sequence, cleanTitle);

  return {
    id: `daily_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: formattedTitle,
    status: TASK_STATUSES.OPEN,
    dueDate: todayDateStr,
    category: masterTask.category || 'General',
    sourceMasterId: masterTask.id || null
  };
}
