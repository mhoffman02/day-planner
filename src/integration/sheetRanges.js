/**
 * @file sheetRanges.js
 * @description Pure A1-notation helpers for the hub Sheet: column letters, quoted tab names, and
 * ValueRange batching. Single source for Config.gs and LedgerRepository.gs. No Google services.
 */

/**
 * @param {number} n 1-based column index
 * @returns {string} A1 column letters (1 -> A, 27 -> AA)
 */
export function colLetter(n) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`colLetter: n must be an integer >= 1, got ${String(n)}`);
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/**
 * @param {string} name Sheet tab name
 * @returns {string} Name wrapped in single quotes with embedded quotes doubled
 */
export function quoteTab(name) {
  if (typeof name !== 'string' || name === '') throw new Error('quoteTab: tab name must be a non-empty string');
  return "'" + name.replace(/'/g, "''") + "'";
}

/**
 * @param {string} tab Sheet tab name
 * @param {string} a1 A1 range within the tab (e.g. 'A2:C9')
 * @returns {string} Fully qualified range, e.g. 'O''Brien'!A1
 */
export function a1Range(tab, a1) {
  if (typeof a1 !== 'string' || a1 === '') throw new Error('a1Range: a1 must be a non-empty string');
  return quoteTab(tab) + '!' + a1;
}

/**
 * @param {Array<{tab:string,a1:string,values:Array<Array<*>>}>} writes Queued writes
 * @returns {Array<{range:string,values:Array<Array<*>>}>} Sheets ValueRange objects
 */
export function buildValueRanges(writes) {
  if (!Array.isArray(writes)) throw new Error('buildValueRanges: writes must be an array');
  return writes.map((w, i) => {
    if (!w || !Array.isArray(w.values) || !w.values.every(Array.isArray)) {
      throw new Error(`buildValueRanges: writes[${i}].values must be a 2D array`);
    }
    return { range: a1Range(w.tab, w.a1), values: w.values };
  });
}

/**
 * @param {Array} ranges ValueRange objects
 * @param {number} [cap] Max ranges per batch
 * @returns {Array<Array>} Batches of at most cap ranges
 */
export function chunkValueRanges(ranges, cap = 50) {
  if (!Array.isArray(ranges)) throw new Error('chunkValueRanges: ranges must be an array');
  if (!Number.isInteger(cap) || cap < 1) throw new Error(`chunkValueRanges: cap must be an integer >= 1, got ${String(cap)}`);
  const out = [];
  for (let i = 0; i < ranges.length; i += cap) out.push(ranges.slice(i, i + cap));
  return out;
}
