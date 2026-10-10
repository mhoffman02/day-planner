/**
 * @file saveGuard.js
 * @description Fail-closed helpers for optimistic writes to Google (Tasks/Drive/Calendar).
 * Mirrored as dp-prefixed functions inside gas-app/Script.html (keep both copies in sync; the
 * parity is exercised by tests/failClosedSaves.test.js, which runs every component method that
 * uses these against BOTH client copies).
 *
 * The rules they encode:
 *   - a missing bridge method is a failed save, never a silent success;
 *   - a null/undefined server result for an update (Code.gs returns null on a 404) means
 *     the write did not land;
 *   - a rollback only restores a field if it still holds the value this operation wrote, so a
 *     newer edit made while the failed request was in flight is never clobbered.
 */

/**
 * Calls the first bridge method in `candidates` that exists.
 * @param {object} bridge GASBridge instance (may be null).
 * @param {Array<[string, Array]>} candidates [methodName, args] pairs, in preference order.
 * @param {string} what Human description of the write, for the error text.
 * @returns {Promise<*>} The bridge method result.
 * @throws {Error} When no candidate method exists on the bridge.
 */
export async function callBridge(bridge, candidates, what) {
  for (const [name, args] of candidates) {
    if (bridge && typeof bridge[name] === 'function') {
      return bridge[name](...args);
    }
  }
  const names = candidates.map(([name]) => name).join(' / ');
  throw new Error(`Not saved: ${what} -- server method ${names} is unavailable in this build.`);
}

/**
 * @param {*} result Bridge result for an update.
 * @param {string} what Human description of the write, for the error text.
 * @returns {*} result, when it is a real object/value.
 * @throws {Error} When result is null/undefined (task deleted elsewhere, or nothing written).
 */
export function requireSaved(result, what) {
  if (result === null || result === undefined) {
    throw new Error(`Not saved: ${what} -- the item no longer exists in Google (deleted elsewhere?). Reload to refresh.`);
  }
  return result;
}

/**
 * Restores obj[field] to previous only if it still holds the value this operation wrote.
 * @returns {boolean} True when the field was rolled back.
 */
export function restoreIfUnchanged(obj, field, wrote, previous) {
  if (!obj || obj[field] !== wrote) return false;
  obj[field] = previous;
  return true;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * @param {number|null} syncedAt Epoch ms of the last successful server sync.
 * @returns {string} e.g. "Oct 9, 2:05 PM", or "unknown" when never synced this session.
 */
export function formatSyncedAt(syncedAt) {
  if (!syncedAt) return 'unknown';
  const d = new Date(syncedAt);
  if (isNaN(d.getTime())) return 'unknown';
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${h % 12 || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * @param {string} label What is being shown from cache (e.g. "Master Tasks").
 * @param {number|null} syncedAt Epoch ms of the cached copy's last server sync.
 * @param {Error} err The refresh failure.
 * @returns {string} User-facing stale/offline notice (err.message only, never the stack).
 */
export function staleNoticeText(label, syncedAt, err) {
  const reason = (err && err.message) || String(err);
  return `${label}: showing offline copy (last synced ${formatSyncedAt(syncedAt)}). Refresh failed: ${reason}`;
}
