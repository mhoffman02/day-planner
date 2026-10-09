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
    if (attempts > 0) pending.MetadataJson = JSON.stringify({ attempts });
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
