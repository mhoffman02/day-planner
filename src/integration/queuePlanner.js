/**
 * @file queuePlanner.js
 * @description Pure, bounded, resumable batch planner for the workflow queue (Phase 28).
 * Refuses to run without the lock, no-ops when the GMAIL_ROUTER flag is off, processes items
 * independently (a malformed item or one whose thread vanished is quarantined as an ERROR ledger
 * row with a sanitized message while the rest proceed), and returns the cursor to resume from.
 */
import { beginOp, failOp, sanitizeError, stackFrames, ledgerAttemptsOf } from './ledger.js';

function queuePlannerQuarantine(item, code, message, retryable, now, prior) {
  const valid = item && typeof item === 'object' && typeof item.opKey === 'string' && item.opKey !== ''
    && typeof item.threadId === 'string' && item.threadId !== '';
  const errorMessage = sanitizeError(message);
  let ledgerRow = null;
  if (valid) {
    const pending = beginOp({
      opKey: item.opKey,
      sourceType: 'GMAIL',
      sourceId: item.threadId,
      action: item.action || 'QUEUE_ITEM'
    }, now);
    const attempts = ledgerAttemptsOf(prior);
    const meta = {};
    // A MEETING row must always carry its series: retry never guesses the destination.
    if (typeof item.seriesKey === 'string' && item.seriesKey !== '') meta.seriesKey = item.seriesKey;
    if (attempts > 0) meta.attempts = attempts;
    if (Object.keys(meta).length) pending.MetadataJson = JSON.stringify(meta);
    ledgerRow = failOp(pending, now, { code, message: errorMessage, retryable });
  }
  return {
    opKey: valid ? item.opKey : null,
    status: 'ERROR',
    errorCode: code,
    errorMessage,
    retryable,
    ledgerRow
  };
}

/**
 * Plans one bounded slice of the queue.
 * @param {{items:Array<object>, cursor:number, batchSize:number, lockHeld:boolean, flags:{GMAIL_ROUTER?:boolean}, clock:Function, isSourceAvailable?:Function, priorRow?:Function}} a priorRow(item) returns the item's existing ledger row (keeps the attempt counter across re-quarantines)
 * @returns {{action:'PROCESS'|'NOOP'|'REFUSED', reason:string, toProcess:Array<object>, quarantined:Array<object>, nextCursor:number, done:boolean}}
 */
export function planBatch(a) {
  if (!Array.isArray(a.items)) throw new Error('queuePlanner: items must be an array');
  if (!Number.isInteger(a.cursor) || a.cursor < 0) throw new Error('queuePlanner: cursor must be a non-negative integer');
  if (!Number.isInteger(a.batchSize) || a.batchSize < 1) throw new Error('queuePlanner: batchSize must be a positive integer');
  const empty = { toProcess: [], quarantined: [], nextCursor: a.cursor, done: false };
  if (!a.flags || a.flags.GMAIL_ROUTER !== true) {
    return { ...empty, action: 'NOOP', reason: 'GMAIL_ROUTER flag is off' };
  }
  if (a.lockHeld !== true) {
    return { ...empty, action: 'REFUSED', reason: 'LOCK_NOT_HELD' };
  }
  const now = a.clock();
  const end = Math.min(a.items.length, a.cursor + a.batchSize);
  const toProcess = [];
  const quarantined = [];
  for (let i = a.cursor; i < end; i += 1) {
    const item = a.items[i];
    const wellFormed = item && typeof item === 'object' && typeof item.opKey === 'string' && item.opKey !== ''
      && typeof item.threadId === 'string' && item.threadId !== '';
    if (!wellFormed) {
      quarantined.push(queuePlannerQuarantine(item, 'MALFORMED_ITEM', 'Queue item is missing opKey or threadId', false, now, null));
      continue;
    }
    let available = true;
    if (a.isSourceAvailable) {
      try {
        available = a.isSourceAvailable(item);
      } catch (err) {
        console.error(`queuePlanner: source check failed, quarantining item as retryable: ${sanitizeError(err)}\n${stackFrames(err && err.stack)}`);
        quarantined.push(queuePlannerQuarantine(item, 'SOURCE_CHECK_FAILED', err, true, now, a.priorRow ? a.priorRow(item) : null));
        continue;
      }
    }
    if (!available) {
      quarantined.push(queuePlannerQuarantine(item, 'SOURCE_MISSING', 'Source thread no longer exists', false, now, a.priorRow ? a.priorRow(item) : null));
      continue;
    }
    toProcess.push(item);
  }
  return {
    action: 'PROCESS',
    reason: '',
    toProcess,
    quarantined,
    nextCursor: end,
    done: end >= a.items.length
  };
}

/** A scheduled dry pass is skipped at most this long; then it runs in full (occurrence cutoffs, retry backoff). */
export const DRY_PASS_MAX_AGE_MS = 60 * 60 * 1000;

function queuePlannerCanonical(v) {
  if (Array.isArray(v)) return '[' + v.map(queuePlannerCanonical).join(',') + ']';
  if (v && typeof v.toJSON === 'function') return JSON.stringify(v); // Date cells in registry rows
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + queuePlannerCanonical(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

/**
 * Everything a dry pass's result depends on, as one order-independent string (hash it before storing).
 * Items already reflect the ledger (DONE and blocked keys are filtered out) and the selected meeting occurrence.
 * @param {{items:Array<{opKey:string,threadId:string}>, historyIds:Object<string,string>, features:object, settings:object, registry:Array<object>}} a
 * @returns {string} Canonical fingerprint source.
 */
export function dryPassFingerprintSource(a) {
  const hist = a.historyIds || {};
  const rows = (a.items || []).map((it) => it.opKey + '@' + (hist[it.threadId] || '')).sort();
  return queuePlannerCanonical({ items: rows, features: a.features || {}, settings: a.settings || {}, registry: a.registry || [] });
}

/**
 * Trial mode writes no DONE rows, so without this every scheduled tick re-reads Gmail for the same batch.
 * Only a scheduled dry pass skips, and only when nothing it depends on changed since the last full dry pass.
 * @param {{scheduled:boolean, dry:boolean, fingerprint:string, last:({fp:string, at:string}|null), nowMs:number, maxAgeMs?:number}} a
 * @returns {boolean} True to skip the per-thread reads and reuse the last dry result.
 */
export function shouldSkipDryPass(a) {
  if (!a.scheduled || !a.dry || !a.last || a.last.fp !== a.fingerprint) return false;
  const age = a.nowMs - Date.parse(a.last.at);
  return age >= 0 && age < (a.maxAgeMs || DRY_PASS_MAX_AGE_MS);
}
