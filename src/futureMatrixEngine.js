/**
 * @file futureMatrixEngine.js
 * @description Future Planning Matrix (12-month overview) — Franklin Covey's "flip ahead
 * and jot down the big rocks" workflow applied to a full year. Items live in a month's
 * bucket until they're transferred onto a specific day's task list (src/taskEngine.js
 * handles that transfer) or carried forward to the next month if still open.
 */

import { generateLocalId } from './binderStore.js';

/** Month keys 'MM' for a 12-month year, in order. */
export const MONTH_KEYS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

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
