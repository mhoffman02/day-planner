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

/**
 * Per-item save serializer. Saves submitted under the same key run one at a time, in order;
 * while one is in flight, newer submits only replace the queued value (latest wins, superseded
 * intermediate values are skipped). Tracks the last value the server confirmed per key, so a
 * failure rolls back to it -- never to an earlier unconfirmed value.
 *
 * submit(key, job) where job = { value, baseline, write(value), onSaved(value, result, hasNewer),
 * onFailed(err, lastConfirmed) }:
 *   - baseline: the value currently known to be saved; adopted as lastConfirmed when the key is
 *     idle (after an idle period the UI holds the confirmed or reloaded server value);
 *   - write: performs the save, throws on failure;
 *   - onSaved runs after every confirmed write (hasNewer is true when a newer value is queued, so
 *     the caller must not cache live state as saved yet);
 *   - onFailed runs only when the LATEST value failed (nothing newer queued). A failure that is
 *     superseded by a queued value is logged and the queued value is sent instead.
 * Returns the drain promise for the submit that started it; a coalesced submit resolves at once
 * (the in-flight drain will send its value), so callers never deadlock on their own queue.
 *
 * Server re-reads (a full-day reload) reconcile against the queue instead of replacing local
 * state: mark() before the read, then reconcile(key, serverValue, mark) per item (see below).
 */
export function createSaveQueue() {
  const items = new Map();
  // Monotonic clock over submits and confirmations, so a server read can tell which local
  // values it may predate.
  let clock = 0;

  async function drain(item) {
    while (item.pending) {
      const job = item.pending;
      item.pending = null;
      let result;
      item.writing = true;
      try {
        result = await job.write(job.value);
      } catch (err) {
        item.writing = false;
        if (item.pending) {
          console.error(`🔥 save ${item.key}: write failed but a newer value is queued; sending that instead of rolling back:`, err.stack);
          continue;
        }
        await job.onFailed(err, item.confirmed);
        continue;
      }
      item.writing = false;
      item.confirmed = job.value;
      item.confirmedAt = ++clock;
      if (job.onSaved) await job.onSaved(job.value, result, Boolean(item.pending));
    }
  }

  return {
    submit(key, job) {
      let item = items.get(key);
      if (!item) {
        item = { key, confirmed: job.baseline, confirmedAt: 0, submittedAt: 0, latest: undefined, pending: null, running: null, writing: false };
        items.set(key, item);
      }
      if (!item.running) {
        item.confirmed = job.baseline;
        item.confirmedAt = clock;
      }
      item.submittedAt = ++clock;
      item.latest = job.value;
      item.pending = job;
      if (item.running) return Promise.resolve();
      item.running = drain(item).finally(() => { item.running = null; });
      return item.running;
    },
    /** @returns {number} A marker to take just before a server read starts (see reconcile). */
    mark() {
      return clock;
    },
    /**
     * Reconciles one item of a reloaded copy with the queue.
     * @param {string} key Save key (e.g. task-status:<id>).
     * @param {*} incomingValue The value in the reloaded copy.
     * @param {number|null} mark mark() taken before a SERVER read; null when the copy is not a
     *   fresh server read (e.g. the local cache), which is then never adopted as confirmed.
     * @returns {{keepLocal: boolean, confirmed: *}} keepLocal: the local value must stay on
     *   screen (a value is queued or being written, or was submitted or confirmed after the read began).
     *   confirmed: the value known to be saved, for the cache; the server value is adopted as the
     *   rollback target unless a save confirmed after the read began (the read may predate it).
     */
    reconcile(key, incomingValue, mark) {
      const item = items.get(key);
      if (!item) return { keepLocal: false, confirmed: incomingValue };
      const unsaved = Boolean(item.pending) || item.writing;
      if (mark === null || mark === undefined) return { keepLocal: unsaved, confirmed: item.confirmed };
      if (item.confirmedAt <= mark) item.confirmed = incomingValue;
      return { keepLocal: unsaved || item.submittedAt > mark || item.confirmedAt > mark, confirmed: item.confirmed };
    },
    /** @returns {*} The most recently submitted value for key (undefined if never submitted). */
    latest(key) {
      const item = items.get(key);
      return item ? item.latest : undefined;
    },
    /** @returns {boolean} True while a save for key is in flight. */
    busy(key) {
      const item = items.get(key);
      return Boolean(item && item.running);
    },
    /** @returns {boolean} True while a value for key is queued or being written (not yet confirmed or failed). */
    unsaved(key) {
      const item = items.get(key);
      return Boolean(item && (item.pending || item.writing));
    },
    /** @returns {*} The last value the server confirmed for key (undefined if never submitted). */
    confirmed(key) {
      const item = items.get(key);
      return item ? item.confirmed : undefined;
    },
    /**
     * Drops the queued (not yet sent) value for key, e.g. because the item is being deleted. An
     * in-flight write is not affected (await idle(key) for it).
     * @returns {boolean} True when a queued value was dropped.
     */
    cancel(key) {
      const item = items.get(key);
      if (!item || !item.pending) return false;
      item.pending = null;
      return true;
    },
    /**
     * @returns {Promise<void>} Settles once nothing for key is queued or in flight. A failure of
     *   that drain belongs to its own submitter; here it is logged and the wait still ends.
     */
    idle(key) {
      const item = items.get(key);
      if (!item || !item.running) return Promise.resolve();
      return item.running.then(() => undefined, (err) => {
        console.error(`🔥 save ${key}: its save handler threw (reported to its own caller); continuing after it settled:`, (err && err.stack) || String(err));
      });
    }
  };
}

const SHORT_MONTHS =['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
