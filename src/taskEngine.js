/**
 * Franklin Planner Task Engine
 * Handles task priorities (A1-C9), status codes, task ordering, and "Move to Today" transfer logic.
 */

export const TASK_STATUSES = {
  OPEN: '•', // or open/in-process
  COMPLETED: '✓',
  FORWARDED: '→',
  CANCELED: 'X',
  DELEGATED: 'G/✓'
};

export const STATUS_LIST = ['•', '✓', '→', 'X', 'G/✓'];

/**
 * Parses a task title that may contain a priority prefix like [A1] or [B3]
 * @param {string} rawTitle 
 * @returns {object} { priorityGroup: 'A'|'B'|'C'|null, sequence: number|null, priorityCode: string|null, cleanTitle: string }
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
 * Formats task title with priority prefix
 */
export function formatTaskTitle(priorityGroup, sequence, cleanTitle) {
  const trimmed = (cleanTitle || '').trim();
  if (priorityGroup && sequence) {
    return `[${priorityGroup.toUpperCase()}${sequence}] ${trimmed}`;
  }
  return trimmed;
}

/**
 * Cycle to the next task status code
 */
export function getNextStatus(currentStatus) {
  const idx = STATUS_LIST.indexOf(currentStatus);
  if (idx === -1 || idx === STATUS_LIST.length - 1) {
    return STATUS_LIST[0];
  }
  return STATUS_LIST[idx + 1];
}

/**
 * Sorts array of task objects by priority (A1, A2... B1... C9... Unprioritized)
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
 * Finds next available sequence integer for a priority group ('A', 'B', or 'C')
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
 * Transfers a monthly master task to the daily task list for today
 */
export function transferMasterTaskToToday(masterTask, existingDailyTasks = [], targetPriorityGroup = 'A', todayDateStr = new Date().toISOString().slice(0, 10)) {
  const cleanTitle = parseTaskTitle(masterTask.title).cleanTitle || masterTask.title || 'Untitled Task';
  const sequence = getNextSequence(existingDailyTasks, targetPriorityGroup);
  const formattedTitle = formatTaskTitle(targetPriorityGroup, sequence, cleanTitle);

  return {
    id: `daily_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    title: formattedTitle,
    status: TASK_STATUSES.OPEN,
    dueDate: todayDateStr,
    category: masterTask.category || 'General',
    sourceMasterId: masterTask.id || null
  };
}
