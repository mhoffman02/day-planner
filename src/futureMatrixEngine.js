/**
 * @file futureMatrixEngine.js
 * @description Future Planning Matrix (12-month overview) — Franklin Covey's "flip ahead
 * and jot down the big rocks" workflow applied to a full year. Items live in a month's
 * bucket until they're transferred onto a specific day's task list (src/taskEngine.js
 * handles that transfer) or carried forward to the next month if still open.
 *
 * Extended with:
 * - Multi-quarter milestone tracking across Q1-Q4 horizons
 * - Rolling horizon projections for continuous 3/6/12-month planning
 */

import { generateLocalId } from './binderStore.js';

/** Month keys 'MM' for a 12-month year, in order. */
export const MONTH_KEYS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

/** Quarter identifiers in standard calendar sequence. */
export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

/**
 * Builds a full 'YYYY-MM' month key.
 * @param {number|string} year Calendar year.
 * @param {number|string} monthNum Month number (1-12).
 * @returns {string} Month key in YYYY-MM format.
 */
export function monthKeyFor(year, monthNum) {
  return `${year}-${String(monthNum).padStart(2, '0')}`;
}

/**
 * Creates a new future planning item with default open status.
 * @param {string} title Item title/description.
 * @param {string} [category='General'] Optional category label.
 * @returns {{id: string, title: string, category: string, status: string, createdAt: string}}
 */
export function createFutureItem(title, category = 'General') {
  return {
    id: generateLocalId('fm', 7),
    title,
    category,
    status: '•',
    createdAt: new Date().toISOString()
  };
}

/**
 * Computes the month key immediately following the given one, rolling over into the next
 * calendar year after December.
 * @param {string} monthKey Source month key in YYYY-MM format.
 * @returns {string} The following month's key in YYYY-MM format.
 */
export function nextMonthKey(monthKey) {
  const [yearStr, monthStr] = monthKey.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Builds an empty 12-month matrix skeleton for a given year, pre-seeded with an empty
 * item array for every month so callers never have to null-check a month bucket.
 * @param {number|string} year Calendar year.
 * @returns {{year: string, months: Object<string, Array<object>>}}
 */
export function emptyYearMatrix(year) {
  const months = {};
  MONTH_KEYS.forEach(mm => {
    months[`${year}-${mm}`] = [];
  });
  return { year: String(year), months };
}

/* ==========================================================================
   Multi-Quarter Milestone Tracking
   ========================================================================== */

/**
 * Returns the quarter identifier ('Q1'–'Q4') for a given month number or month key.
 * @param {number|string} monthVal Month number (1-12) or month key e.g. "2026-08" or "08".
 * @returns {'Q1'|'Q2'|'Q3'|'Q4'}
 */
export function quarterForMonth(monthVal) {
  let m = typeof monthVal === 'number' ? monthVal : parseInt(String(monthVal).slice(-2), 10);
  if (isNaN(m) || m < 1) m = 1;
  if (m > 12) m = 12;
  if (m <= 3) return 'Q1';
  if (m <= 6) return 'Q2';
  if (m <= 9) return 'Q3';
  return 'Q4';
}

/**
 * Builds a full 'YYYY-Q#' quarter key.
 * @param {number|string} year Calendar year.
 * @param {number|string} quarterNum Quarter number (1-4) or label ("Q1"-"Q4").
 * @returns {string} Quarter key e.g. "2026-Q1".
 */
export function quarterKeyFor(year, quarterNum) {
  const qStr = String(quarterNum).toUpperCase().replace(/^Q/, '');
  return `${year}-Q${qStr}`;
}

/**
 * Returns the three YYYY-MM month keys belonging to a given quarter.
 * @param {number|string} year Calendar year.
 * @param {number|string} quarterVal Quarter number (1-4) or label ("Q1"-"Q4").
 * @returns {Array<string>} Array of 3 month keys in YYYY-MM format.
 */
export function getMonthsForQuarter(year, quarterVal) {
  const qNum = parseInt(String(quarterVal).toUpperCase().replace(/^Q/, ''), 10) || 1;
  const startMonth = (qNum - 1) * 3 + 1;
  return [
    monthKeyFor(year, startMonth),
    monthKeyFor(year, startMonth + 1),
    monthKeyFor(year, startMonth + 2)
  ];
}

/**
 * Creates a structured milestone record spanning one or more quarters.
 * @param {string} title Milestone title / objective.
 * @param {string} targetQuarter Target quarter key e.g. "2026-Q3".
 * @param {object} [options={}] Optional attributes.
 * @param {string} [options.category='General'] Milestone category.
 * @param {string} [options.description=''] Milestone description or criteria.
 * @param {string|null} [options.targetMonth=null] Specific target month e.g. "2026-09".
 * @param {Array<object>} [options.deliverables=[]] Sub-tasks or checklist deliverables.
 * @returns {{
 *   id: string,
 *   title: string,
 *   targetQuarter: string,
 *   category: string,
 *   description: string,
 *   targetMonth: string|null,
 *   deliverables: Array<object>,
 *   status: string,
 *   progress: number,
 *   createdAt: string
 * }}
 */
export function createMilestone(title, targetQuarter, options = {}) {
  const deliverables = (options.deliverables || []).map(d => ({
    id: d.id || generateLocalId('dlv', 5),
    title: typeof d === 'string' ? d : d.title,
    status: d.status || '•'
  }));

  const completedCount = deliverables.filter(d => d.status === '✓').length;
  const progress = deliverables.length > 0 ? Math.round((completedCount / deliverables.length) * 100) : 0;

  return {
    id: generateLocalId('ms', 7),
    title,
    targetQuarter,
    category: options.category || 'General',
    description: options.description || '',
    targetMonth: options.targetMonth || null,
    deliverables,
    status: '•',
    progress,
    createdAt: new Date().toISOString()
  };
}

/**
 * Advances a quarter key forward by one quarter (e.g. "2026-Q1" -> "2026-Q2", "2026-Q4" -> "2027-Q1").
 * @param {string} quarterKey Quarter string e.g. "2026-Q3".
 * @returns {string} The advanced quarter key.
 */
export function advanceQuarterKey(quarterKey) {
  const match = String(quarterKey).match(/^(\d{4})-Q([1-4])$/);
  if (!match) return quarterKey;
  let year = parseInt(match[1], 10);
  let q = parseInt(match[2], 10) + 1;
  if (q > 4) {
    q = 1;
    year += 1;
  }
  return `${year}-Q${q}`;
}

/**
 * Regresses a quarter key backward by one quarter (e.g. "2026-Q2" -> "2026-Q1", "2026-Q1" -> "2025-Q4").
 * @param {string} quarterKey Quarter string e.g. "2026-Q3".
 * @returns {string} The regressed quarter key.
 */
export function regressQuarterKey(quarterKey) {
  const match = String(quarterKey).match(/^(\d{4})-Q([1-4])$/);
  if (!match) return quarterKey;
  let year = parseInt(match[1], 10);
  let q = parseInt(match[2], 10) - 1;
  if (q < 1) {
    q = 4;
    year -= 1;
  }
  return `${year}-Q${q}`;
}

/**
 * Updates an existing milestone with new field values, keeping id/createdAt intact
 * and recalculating deliverable progress.
 * @param {object} milestone Target milestone.
 * @param {object} [updates={}] Partial milestone fields to update.
 * @returns {object} Updated milestone record.
 */
export function updateMilestone(milestone, updates = {}) {
  const updated = { ...milestone, ...updates };

  if (Array.isArray(updates.deliverables)) {
    updated.deliverables = updates.deliverables.map(d => ({
      id: d.id || generateLocalId('dlv', 5),
      title: typeof d === 'string' ? d : d.title,
      status: d.status || '•'
    }));
  }

  const dList = updated.deliverables || [];
  if (dList.length > 0) {
    const completed = dList.filter(d => d.status === '✓').length;
    updated.progress = Math.round((completed / dList.length) * 100);
    if (updated.progress === 100) {
      updated.status = '✓';
    } else if (updated.status === '✓' && updated.progress < 100) {
      updated.status = '→';
    }
  } else if (updates.status !== undefined) {
    updated.status = updates.status;
    if (updated.status === '✓') updated.progress = 100;
    else if (updated.status === '•') updated.progress = 0;
  }

  return updated;
}

/**
 * Cycles a milestone or future item status marker across Franklin Covey states:
 * '•' (open) -> '→' (in progress) -> '✓' (completed) -> 'X' (cancelled) -> '•'.
 * @param {string} currentStatus
 * @returns {'•'|'→'|'✓'|'X'}
 */
export function cycleMilestoneStatus(currentStatus) {
  const cycle = { '•': '→', '→': '✓', '✓': 'X', 'X': '•' };
  return cycle[currentStatus] || '•';
}

/**
 * Toggles milestone completion status between completed ('✓') and open ('•').
 * Automatically syncs all sub-deliverables to match.
 * @param {object} milestone
 * @returns {object}
 */
export function toggleMilestoneStatus(milestone) {
  const isCompleted = milestone.status === '✓';
  const newStatus = isCompleted ? '•' : '✓';
  const newProgress = isCompleted ? 0 : 100;
  const deliverables = (milestone.deliverables || []).map(d => ({
    ...d,
    status: newStatus
  }));

  return {
    ...milestone,
    status: newStatus,
    progress: newProgress,
    deliverables
  };
}

/**
 * Adds a new deliverable sub-task to a milestone and recalculates progress.
 * @param {object} milestone
 * @param {string} title
 * @returns {object}
 */
export function addDeliverable(milestone, title) {
  if (!title || !title.trim()) return { ...milestone };
  const deliverables = [
    ...(milestone.deliverables || []),
    { id: generateLocalId('dlv', 5), title: title.trim(), status: '•' }
  ];
  const completed = deliverables.filter(d => d.status === '✓').length;
  const progress = Math.round((completed / deliverables.length) * 100);

  return {
    ...milestone,
    deliverables,
    progress,
    status: progress === 100 ? '✓' : (milestone.status === '✓' ? '→' : milestone.status)
  };
}

/**
 * Toggles a single deliverable's completion status within a milestone and recalculates progress.
 * @param {object} milestone
 * @param {string} deliverableId
 * @returns {object}
 */
export function toggleDeliverable(milestone, deliverableId) {
  const deliverables = (milestone.deliverables || []).map(d => {
    if (d.id !== deliverableId) return d;
    return { ...d, status: d.status === '✓' ? '•' : '✓' };
  });

  const completed = deliverables.filter(d => d.status === '✓').length;
  const progress = deliverables.length > 0 ? Math.round((completed / deliverables.length) * 100) : 0;
  let status = milestone.status;
  if (progress === 100) {
    status = '✓';
  } else if (progress > 0) {
    status = '→';
  } else if (milestone.status === '✓') {
    status = '•';
  }

  return {
    ...milestone,
    deliverables,
    progress,
    status
  };
}

/**
 * Reschedules a milestone to a new target quarter and optional target month.
 * @param {object} milestone
 * @param {string} newTargetQuarter
 * @param {string|null} [newTargetMonth=null]
 * @returns {object}
 */
export function rescheduleMilestone(milestone, newTargetQuarter, newTargetMonth = null) {
  return {
    ...milestone,
    targetQuarter: newTargetQuarter,
    targetMonth: newTargetMonth
  };
}

/**
 * Groups items in a 12-month year matrix into quarterly buckets.
 * @param {{year: string, months: Object<string, Array<object>>}} yearMatrix
 * @returns {Object<'Q1'|'Q2'|'Q3'|'Q4', Array<object>>}
 */
export function groupItemsByQuarter(yearMatrix) {
  const result = { Q1: [], Q2: [], Q3: [], Q4: [] };
  if (!yearMatrix || !yearMatrix.months) return result;

  const y = yearMatrix.year;
  for (let q = 1; q <= 4; q++) {
    const qKey = `Q${q}`;
    const months = getMonthsForQuarter(y, q);
    for (const m of months) {
      if (Array.isArray(yearMatrix.months[m])) {
        result[qKey].push(...yearMatrix.months[m]);
      }
    }
  }

  return result;
}

/**
 * Evaluates and aggregates multi-quarter milestones relative to an active quarter.
 * @param {Array<object>} milestones List of milestone objects.
 * @param {string} [activeQuarterKey] Optional active quarter key e.g. "2026-Q3".
 * @returns {{
 *   byQuarter: Object<string, Array<object>>,
 *   current: Array<object>,
 *   upcoming: Array<object>,
 *   past: Array<object>,
 *   overdue: Array<object>,
 *   stats: { total: number, completed: number, open: number, completionRate: number }
 * }}
 */
export function trackMultiQuarterMilestones(milestones = [], activeQuarterKey = null) {
  const byQuarter = {};
  const current = [];
  const upcoming = [];
  const past = [];
  const overdue = [];

  let completedCount = 0;

  for (const ms of milestones) {
    const qKey = ms.targetQuarter || 'Unassigned';
    if (!byQuarter[qKey]) byQuarter[qKey] = [];
    byQuarter[qKey].push(ms);

    const isCompleted = ms.status === '✓' || ms.progress >= 100;
    if (isCompleted) completedCount++;

    if (activeQuarterKey) {
      if (ms.targetQuarter === activeQuarterKey) {
        current.push(ms);
      } else if (ms.targetQuarter > activeQuarterKey) {
        upcoming.push(ms);
      } else {
        past.push(ms);
        if (!isCompleted && ms.status !== 'X') {
          overdue.push(ms);
        }
      }
    } else {
      current.push(ms);
    }
  }

  const total = milestones.length;
  const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return {
    byQuarter,
    current,
    upcoming,
    past,
    overdue,
    stats: {
      total,
      completed: completedCount,
      open: total - completedCount,
      completionRate
    }
  };
}

/* ==========================================================================
   Rolling Horizon Projections
   ========================================================================== */

/**
 * Generates an ordered sequence of rolling month descriptors starting from a base month.
 * Automatically handles year transitions across the rolling planning horizon.
 * @param {string} startMonthKey Base month key in YYYY-MM format.
 * @param {number} [horizonLength=12] Number of projection months forward.
 * @returns {Array<{
 *   monthKey: string,
 *   year: number,
 *   month: number,
 *   quarter: 'Q1'|'Q2'|'Q3'|'Q4',
 *   quarterKey: string,
 *   index: number
 * }>}
 */
export function generateRollingHorizon(startMonthKey, horizonLength = 12) {
  const horizon = [];
  let currentKey = startMonthKey;

  for (let i = 0; i < horizonLength; i++) {
    const [yStr, mStr] = currentKey.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const quarter = quarterForMonth(month);
    const quarterKey = quarterKeyFor(year, quarter);

    horizon.push({
      monthKey: currentKey,
      year,
      month,
      quarter,
      quarterKey,
      index: i
    });

    currentKey = nextMonthKey(currentKey);
  }

  return horizon;
}

/**
 * Projects items and workload density across a rolling planning horizon.
 * @param {Array<object>} rollingHorizon Array returned by generateRollingHorizon.
 * @param {Object<string, Array<object>>} [itemsByMonth={}] Map of items keyed by YYYY-MM.
 * @param {Array<object>} [milestones=[]] List of milestones to map onto horizon buckets.
 * @returns {{
 *   horizon: Array<{
 *     monthKey: string,
 *     year: number,
 *     month: number,
 *     quarter: string,
 *     quarterKey: string,
 *     items: Array<object>,
 *     milestones: Array<object>,
 *     loadCount: number,
 *     openCount: number,
 *     completedCount: number,
 *     pacing: 'light'|'moderate'|'heavy'
 *   }>,
 *   summary: {
 *     totalItems: number,
 *     totalMilestones: number,
 *     openItems: number,
 *     completedItems: number,
 *     peakMonth: string|null,
 *     averageItemsPerMonth: number
 *   }
 * }}
 */
export function projectRollingHorizon(rollingHorizon = [], itemsByMonth = {}, milestones = []) {
  let totalItems = 0;
  let totalMilestones = 0;
  let openItems = 0;
  let completedItems = 0;
  let peakLoad = -1;
  let peakMonth = null;

  const horizon = rollingHorizon.map(slot => {
    const monthItems = itemsByMonth[slot.monthKey] || [];
    const monthMilestones = milestones.filter(ms =>
      ms.targetMonth === slot.monthKey || (!ms.targetMonth && ms.targetQuarter === slot.quarterKey)
    );

    const loadCount = monthItems.length;
    const openCount = monthItems.filter(it => it.status !== '✓' && it.status !== 'X').length;
    const completedCount = monthItems.filter(it => it.status === '✓').length;

    totalItems += loadCount;
    totalMilestones += monthMilestones.length;
    openItems += openCount;
    completedItems += completedCount;

    if (loadCount > peakLoad) {
      peakLoad = loadCount;
      peakMonth = slot.monthKey;
    }

    let pacing = 'light';
    if (loadCount >= 8) {
      pacing = 'heavy';
    } else if (loadCount >= 4) {
      pacing = 'moderate';
    }

    return {
      ...slot,
      items: monthItems,
      milestones: monthMilestones,
      loadCount,
      openCount,
      completedCount,
      pacing
    };
  });

  const count = rollingHorizon.length;
  const averageItemsPerMonth = count > 0 ? Math.round((totalItems / count) * 10) / 10 : 0;

  return {
    horizon,
    summary: {
      totalItems,
      totalMilestones,
      openItems,
      completedItems,
      peakMonth,
      averageItemsPerMonth
    }
  };
}

/**
 * Rolls forward all uncompleted items from one month bucket to another.
 * @param {string} fromMonthKey Source month e.g. "2026-08".
 * @param {string} toMonthKey Destination month e.g. "2026-09".
 * @param {Array<object>} [items=[]] List of items from the source month.
 * @returns {{
 *   forwardedItems: Array<object>,
 *   updatedSourceItems: Array<object>
 * }}
 */
export function rollForwardPendingItems(fromMonthKey, toMonthKey, items = []) {
  const forwardedItems = [];
  const updatedSourceItems = [];

  for (const item of items) {
    const isPending = item.status !== '✓' && item.status !== 'X';
    if (isPending) {
      updatedSourceItems.push({
        ...item,
        status: '→'
      });

      forwardedItems.push({
        id: generateLocalId('fm', 7),
        title: item.title,
        category: item.category || 'General',
        status: '•',
        rolledFrom: fromMonthKey,
        targetMonth: toMonthKey,
        createdAt: new Date().toISOString()
      });
    } else {
      updatedSourceItems.push({ ...item });
    }
  }

  return { forwardedItems, updatedSourceItems };
}
