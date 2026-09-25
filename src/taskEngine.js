/**
 * @file taskEngine.js
 * @description Day Planner Task Engine.
 * Handles task priorities (A1-C9), status codes, task ordering, and "Move to Today" transfer logic.
 */

import { getLocalDateStr, generateLocalId } from './binderStore.js';

/**
 * Task status code symbols dictionary.
 * @type {Record<string, string>}
 */
export const TASK_STATUSES = {
  OPEN: '•',
  IN_PROGRESS: '○',
  COMPLETED: '✓',
  FORWARDED: '→',
  CANCELED: 'X',
  DELEGATED: 'Ⓓ'
};

/**
 * List of status codes for status cycling.
 * @type {Array<string>}
 */
export const STATUS_LIST = ['•', '○', '✓', '→', 'X', 'Ⓓ'];

/**
 * Human-readable labels for each status glyph in `STATUS_LIST`, in display order.
 * Backs the status-select dropdown UI, which lets a user jump directly to any status
 * (e.g. picking "X" without first cycling through "→" and its forward-to-a-date side effect).
 * @type {Array<{value: string, label: string}>}
 */
export const STATUS_OPTIONS = [
  { value: '•', label: 'Open' },
  { value: '○', label: 'In Progress' },
  { value: '✓', label: 'Done' },
  { value: '→', label: 'Forward' },
  { value: 'X', label: 'Canceled' },
  { value: 'Ⓓ', label: 'Delegated' }
];

/**
 * Checks whether a status glyph is one of the valid `STATUS_LIST` members.
 * Guards direct status-jump UI actions (e.g. a status-select dropdown) against
 * being handed a value outside the known set.
 * @param {string} status Status glyph to validate.
 * @returns {boolean} True if `status` is a member of `STATUS_LIST`.
 */
export function isValidStatus(status) {
  return STATUS_LIST.includes(status);
}

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
 * Extracts an inline priority hash prefix (e.g. "#A", "#b", "#c") from task input text.
 * Requires the prefix to be separated by whitespace, punctuation (: or -), or end of string.
 * Returns the detected priority group ('A', 'B', 'C') or defaultPriority, along with the cleaned title.
 * @param {string} [input=''] Raw user task title input.
 * @param {'A'|'B'|'C'} [defaultPriority='A'] Fallback priority group.
 * @returns {{priorityGroup: 'A'|'B'|'C', cleanTitle: string}} Extracted priority and clean title.
 */
export function extractInlinePriority(input = '', defaultPriority = 'A') {
  if (!input) return { priorityGroup: defaultPriority, cleanTitle: '' };
  const trimmed = input.trim();
  const match = trimmed.match(/^#([abcABC])(?:\s*[:-]\s*|\s+|$)(.*)$/);
  if (match) {
    return {
      priorityGroup: match[1].toUpperCase(),
      cleanTitle: match[2].trim()
    };
  }
  return {
    priorityGroup: defaultPriority,
    cleanTitle: trimmed
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
 * Computes the sort key for a task under a given column, for interactive click-to-sort
 * table headers (distinct from `sortTasks`'s fixed priority-first default ordering, which
 * stays unchanged and is used elsewhere).
 * @param {object} task Task object ({ title, status, category, starred, ... }).
 * @param {'priority'|'status'|'title'|'category'} column Column to compute a sort key for.
 * @returns {string|number} Sortable key for `column`. Unprioritized tasks sort last under
 *   'priority'; unknown statuses sort last under 'status'.
 */
export function getTaskSortValue(task, column) {
  switch (column) {
    case 'priority': {
      const parsed = parseTaskTitle(task.title);
      return parsed.priorityCode || '\uFFFD';
    }
    case 'status': {
      const idx = STATUS_LIST.indexOf(task.status);
      return idx === -1 ? STATUS_LIST.length : idx;
    }
    case 'title': {
      const parsed = parseTaskTitle(task.title);
      const cleanTitle = parsed.cleanTitle || task.title || '';
      return (task.starred ? '★' : '☆') + cleanTitle;
    }
    case 'category':
      return task.category || '';
    case 'dueDate':
      return task.dueDate || '\uFFFF';
    default:
      return '';
  }
}

/**
 * Sorts a task list by a single clickable column, ascending or descending. Stable: ties
 * keep their prior relative order in both directions (uses a comparator multiplier rather
 * than `.reverse()`, which would flip tie-order too).
 * @param {Array<object>} [tasks=[]] Tasks to sort.
 * @param {'priority'|'status'|'title'|'category'} column Column to sort by.
 * @param {'asc'|'desc'} [direction='asc'] Sort direction.
 * @returns {Array<object>} New sorted array.
 */
export function sortTasksByColumn(tasks = [], column, direction = 'asc') {
  const dir = direction === 'desc' ? -1 : 1;
  return [...tasks]
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const va = getTaskSortValue(a.task, column);
      const vb = getTaskSortValue(b.task, column);
      let cmp;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      if (cmp === 0) return a.index - b.index;
      return cmp * dir;
    })
    .map(({ task }) => task);
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

export { getNextSequence as findNextAvailableSequence };

/**
 * Forwards a daily task to a new date, creating a new task entry on the target day —
 * Franklin Covey's "➜ forwarded to a new date" semantics: the original task keeps its
 * FORWARDED status marker in place (so today's page still shows it was handled), while a
 * fresh open task carrying the same priority group/category is created on the target date.
 * @param {object} sourceTask Source daily task object being forwarded.
 * @param {Array<object>} [existingTargetDayTasks=[]] Current daily tasks list on the target date.
 * @param {string} targetDateStr Target date string in YYYY-MM-DD format.
 * @returns {{id: string, title: string, status: string, dueDate: string, category: string, forwardedFromId: string|null}} Newly created daily task object on the target date.
 */
export function forwardTaskToDate(sourceTask, existingTargetDayTasks = [], targetDateStr) {
  const parsed = parseTaskTitle(sourceTask.title);
  const priorityGroup = parsed.priorityGroup || 'A';
  const cleanTitle = parsed.cleanTitle || sourceTask.title || 'Untitled Task';
  const sequence = getNextSequence(existingTargetDayTasks, priorityGroup);
  const formattedTitle = formatTaskTitle(priorityGroup, sequence, cleanTitle);

  return {
    id: generateLocalId('daily', 7),
    title: formattedTitle,
    status: TASK_STATUSES.OPEN,
    dueDate: targetDateStr,
    category: sourceTask.category || 'General',
    forwardedFromId: sourceTask.id || null
  };
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
    id: generateLocalId('daily', 7),
    title: formattedTitle,
    status: TASK_STATUSES.OPEN,
    dueDate: todayDateStr,
    category: masterTask.category || 'General',
    sourceMasterId: masterTask.id || null
  };
}

/**
 * Filters a list of tasks based on an array of active status glyphs.
 * Supports normalization between 'D/✓' and 'Ⓓ' for delegated tasks.
 * @param {Array<object>} tasks Array of task objects.
 * @param {Array<string>} activeStatuses Array of active status codes.
 * @returns {Array<object>} Filtered task array.
 */
export function filterTasksByStatus(tasks, activeStatuses) {
  if (!tasks || !Array.isArray(tasks)) return [];
  if (!activeStatuses || !Array.isArray(activeStatuses)) return tasks;
  const activeSet = new Set(
    activeStatuses.flatMap(s => (s === 'D/✓' || s === 'Ⓓ') ? ['D/✓', 'Ⓓ'] : [s])
  );
  return tasks.filter(task => {
    const rawStatus = task.status || '•';
    return activeSet.has(rawStatus);
  });
}

/**
 * Filters tasks by Date Horizon: 'all', 'future', 'overdue-today', or 'undated'.
 * @param {Array<object>} tasks Tasks array to filter.
 * @param {'all'|'future'|'overdue-today'|'undated'} [horizon='all'] Horizon filter keyword.
 * @param {string} [todayStr] Today’s reference date in YYYY-MM-DD format (defaults to local date).
 * @returns {Array<object>} Filtered task items array.
 */
export function filterTasksByDateHorizon(tasks, horizon = 'all', todayStr = getLocalDateStr()) {
  if (!tasks || !Array.isArray(tasks)) return [];
  if (!horizon || horizon === 'all') return tasks;
  const refDate = todayStr || getLocalDateStr();
  return tasks.filter(task => {
    const due = task.dueDate || task.movedTo || null;
    if (horizon === 'future') {
      return Boolean(due && due > refDate);
    }
    if (horizon === 'overdue-today') {
      return Boolean(due && due <= refDate);
    }
    if (horizon === 'undated') {
      return !due;
    }
    return true;
  });
}

/**
 * Builds the unified Master Tasks commitment clearinghouse list.
 * Merges undated backlog tasks with incomplete dated tasks across all dates (past, today, future).
 * Deduplicates / collapses moved master tasks and their corresponding scheduled daily tasks.
 *
 * @param {Array<object>} rawTasks Array of task objects (from Google Tasks API or local store/bridge).
 * @returns {Array<object>} Deduplicated, unified clearinghouse tasks array.
 */
export function buildMasterTasksClearinghouse(rawTasks = []) {
  if (!Array.isArray(rawTasks)) return [];

  // Normalize each task
  const normalized = rawTasks.map(t => {
    const rawDue = t.due ? String(t.due).substring(0, 10) : (t.dueDate || null);
    const movedTo = t.movedTo || null;
    const movedTaskId = t.movedTaskId || null;
    const sourceMasterId = t.sourceMasterId || null;
    const status = t.status || '•';
    const isCompleted = status === '✓' || status === 'X' || t.status === 'completed';

    return {
      id: t.id,
      title: t.title || '',
      category: t.category || 'General',
      status: status,
      starred: Boolean(t.starred),
      notes: t.notes || '',
      dueDate: rawDue || movedTo || null,
      movedTo: movedTo,
      movedTaskId: movedTaskId,
      sourceMasterId: sourceMasterId,
      rawDue: rawDue,
      isCompleted: isCompleted,
      _orig: t
    };
  });

  const taskById = new Map();
  const dailyBySourceMasterId = new Map();
  const masterByMovedTaskId = new Map();

  for (const item of normalized) {
    if (item.id) taskById.set(item.id, item);
    if (item.sourceMasterId) dailyBySourceMasterId.set(item.sourceMasterId, item);
    if (item.movedTaskId) masterByMovedTaskId.set(item.movedTaskId, item);
  }

  const consumedIds = new Set();
  const clearinghouse = [];

  // First pass: Process moved master tasks and pair them with their daily scheduled task
  for (const item of normalized) {
    if (consumedIds.has(item.id)) continue;

    // Check if item is a master task that was moved
    const targetDaily = item.movedTaskId ? taskById.get(item.movedTaskId) : dailyBySourceMasterId.get(item.id);

    if (targetDaily && targetDaily.id !== item.id) {
      consumedIds.add(item.id);
      consumedIds.add(targetDaily.id);

      // Merge into a single logical record displaying the target scheduled date and live status
      const mergedDueDate = targetDaily.dueDate || item.dueDate || item.movedTo;
      clearinghouse.push({
        id: item.id,
        title: targetDaily.title || item.title,
        category: targetDaily.category || item.category || 'General',
        status: targetDaily.status || item.status,
        starred: Boolean(targetDaily.starred || item.starred),
        notes: targetDaily.notes || item.notes || '',
        dueDate: mergedDueDate,
        movedTo: item.movedTo || targetDaily.dueDate || null,
        movedTaskId: targetDaily.id
      });
      continue;
    }

    // Check if item is a daily task pointing to a master task
    const sourceMaster = item.sourceMasterId ? taskById.get(item.sourceMasterId) : masterByMovedTaskId.get(item.id);
    if (sourceMaster && sourceMaster.id !== item.id) {
      consumedIds.add(item.id);
      consumedIds.add(sourceMaster.id);

      const mergedDueDate = item.dueDate || sourceMaster.dueDate || sourceMaster.movedTo;
      clearinghouse.push({
        id: sourceMaster.id,
        title: item.title || sourceMaster.title,
        category: item.category || sourceMaster.category || 'General',
        status: item.status || sourceMaster.status,
        starred: Boolean(item.starred || sourceMaster.starred),
        notes: item.notes || sourceMaster.notes || '',
        dueDate: mergedDueDate,
        movedTo: sourceMaster.movedTo || item.dueDate || null,
        movedTaskId: item.id
      });
      continue;
    }
  }

  // Second pass: Process remaining unlinked tasks
  for (const item of normalized) {
    if (consumedIds.has(item.id)) continue;

    if (item.rawDue) {
      // Dated task: only include if incomplete
      if (!item.isCompleted) {
        clearinghouse.push({
          id: item.id,
          title: item.title,
          category: item.category,
          status: item.status,
          starred: item.starred,
          notes: item.notes,
          dueDate: item.dueDate,
          movedTo: item.movedTo || null,
          movedTaskId: item.movedTaskId || null
        });
      }
    } else {
      // Undated task: backlog task
      clearinghouse.push({
        id: item.id,
        title: item.title,
        category: item.category,
        status: item.status,
        starred: item.starred,
        notes: item.notes,
        dueDate: item.movedTo || null,
        movedTo: item.movedTo || null,
        movedTaskId: item.movedTaskId || null
      });
    }
  }

  return clearinghouse;
}


