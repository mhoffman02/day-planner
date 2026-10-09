/**
 * @file ledger.js
 * @description Pure idempotency/ledger decision logic for the Gmail/Meeting hub (Phase 28).
 * Rows are plain objects keyed by LEDGER_COLUMNS; persistence, clock and locking are injected
 * ports (store {get,put}, lock {tryLock,releaseLock}, clock()). No Date.now, no Google services.
 * Processed/Error are ledger statuses (not Gmail labels). Error messages are sanitized: never
 * email addresses, message bodies, or long opaque ids.
 */
import { LEDGER_COLUMNS, LEDGER_STATUS } from './contracts.js';

const LEDGER_DEFAULT_STALE_MINUTES = 15;
const LEDGER_DEFAULT_ERROR_MAX = 200;
const LEDGER_DEFAULT_ID_RUN = 20;
const LEDGER_DEFAULT_LOCK_WAIT_MS = 5000;
const LEDGER_MAX_ATTEMPTS = 5;
const LEDGER_BACKOFF_BASE_MIN = 5;
const LEDGER_BACKOFF_MAX_MIN = 240;
const LEDGER_RECENT_WINDOW_DAYS = 14;
// Errors that retrying cannot fix: only a manual retryFailedOperation re-runs them.
const LEDGER_PERMANENT_CODES = Object.freeze(['SERIES_NOT_FOUND', 'OCCURRENCE_NOT_FOUND', 'SOURCE_MISSING']);

function ledgerIso(now) {
  const d = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ledger timestamp: ${String(now)}`);
  return d.toISOString();
}

function ledgerRequire(value, name) {
  if (typeof value !== 'string' || value === '') throw new Error(`ledger: ${name} is required`);
  return value;
}

function ledgerBlankRow() {
  const row = {};
  for (const col of LEDGER_COLUMNS) row[col] = '';
  return row;
}

function ledgerJson(metadata) {
  return metadata === undefined || metadata === null ? '' : JSON.stringify(metadata);
}

function ledgerParseMeta(row) {
  try {
    const parsed = JSON.parse((row && row.MetadataJson) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {object|null} row Ledger row.
 * @returns {number} Failed attempts recorded in the row's MetadataJson (0 when none).
 */
export function ledgerAttemptsOf(row) {
  return Number(ledgerParseMeta(row).attempts) || 0;
}

/**
 * Minutes to wait before the next automatic retry after the nth failed attempt (5, 10, 20, ... capped).
 * @param {number} attempts Failed attempts so far (>= 1).
 * @returns {number}
 */
export function retryBackoffMinutes(attempts) {
  const n = Math.max(1, Number(attempts) || 1);
  return Math.min(LEDGER_BACKOFF_BASE_MIN * 2 ** (n - 1), LEDGER_BACKOFF_MAX_MIN);
}

/**
 * Whether the trigger loop may automatically re-run an ERROR row. Permanent errors (see
 * LEDGER_PERMANENT_CODES, or retryable:false recorded in MetadataJson) never are; retryable ones
 * back off exponentially and stop after the attempt cap. Manual retry ignores this decision.
 * @param {object} row Ledger row.
 * @param {Date|string|number} now
 * @param {{maxAttempts?:number}} [opts]
 * @returns {{retry:boolean, reason:'NOT_ERROR'|'PERMANENT'|'ATTEMPTS_EXHAUSTED'|'BACKOFF'|'OK'}}
 */
export function retryDecision(row, now, opts = {}) {
  if (!row || row.Status !== LEDGER_STATUS.ERROR) return { retry: true, reason: 'NOT_ERROR' };
  const meta = ledgerParseMeta(row);
  if (meta.retryable === false || LEDGER_PERMANENT_CODES.includes(row.ErrorCode)) return { retry: false, reason: 'PERMANENT' };
  const max = opts.maxAttempts === undefined ? LEDGER_MAX_ATTEMPTS : opts.maxAttempts;
  if ((Number(meta.attempts) || 0) >= max) return { retry: false, reason: 'ATTEMPTS_EXHAUSTED' };
  const nowMs = new Date(ledgerIso(now)).getTime();
  if (meta.nextRetryAt && nowMs < Date.parse(meta.nextRetryAt)) return { retry: false, reason: 'BACKOFF' };
  return { retry: true, reason: 'OK' };
}

/**
 * Finds a non-ERROR (PENDING or DONE) MEETING row for the same thread and series inside the recent
 * window, so a retry after a crash reuses its occurrence instead of creating a second carry-in when
 * the cutoff has rolled over to a later occurrence. Most recently updated row wins.
 * @param {Array<object>} rows Ledger rows.
 * @param {{threadId:string, seriesKey:string, now:Date|string|number, windowDays?:number}} q
 * @returns {object|null}
 */
export function findActiveMeetingRow(rows, q) {
  const nowMs = new Date(ledgerIso(q.now)).getTime();
  const windowMs = (q.windowDays === undefined ? LEDGER_RECENT_WINDOW_DAYS : q.windowDays) * 86400000;
  const prefix = `GMAIL|${q.threadId}|MEETING|`;
  let best = null;
  for (const r of rows || []) {
    if (!r || typeof r.OperationKey !== 'string' || !r.OperationKey.startsWith(prefix)) continue;
    if (r.Status !== LEDGER_STATUS.PENDING && r.Status !== LEDGER_STATUS.DONE) continue;
    const meta = ledgerParseMeta(r);
    if (meta.seriesKey && meta.seriesKey !== q.seriesKey) continue;
    const at = Date.parse(r.UpdatedAt || r.CreatedAt || '');
    if (Number.isNaN(at) || nowMs - at > windowMs) continue;
    if (!best || at > Date.parse(best.UpdatedAt || best.CreatedAt)) best = r;
  }
  return best;
}

/**
 * Masks an opaque id for display, keeping only the first and last three characters.
 * @param {string} id
 * @returns {string}
 */
export function maskId(id) {
  const s = String(id === undefined || id === null ? '' : id);
  if (s.length <= 8) return '***';
  return `${s.slice(0, 3)}...${s.slice(-3)}`;
}

/**
 * Reduces any error to a short, single-line message safe to persist/log.
 * @param {Error|string|undefined} err
 * @param {number} [maxLen]
 * @returns {string}
 */
export function sanitizeError(err, maxLen = LEDGER_DEFAULT_ERROR_MAX) {
  const raw = err && typeof err === 'object' ? err.message : err;
  if (raw === undefined || raw === null || String(raw).trim() === '') return 'Unknown error';
  let s = String(raw).split(/\r?\n/)[0];
  s = s.replace(/https?:\/\/\S+/gi, '[url]');
  s = s.replace(/[^\s@<>"']+@[^\s@<>"']+/g, '[email]');
  s = s.replace(new RegExp(`[A-Za-z0-9_-]{${LEDGER_DEFAULT_ID_RUN},}`, 'g'), '[id]');
  s = s.trim();
  if (s.length > maxLen) s = `${s.slice(0, Math.max(0, maxLen - 3))}...`;
  return s;
}

/**
 * Human-readable DRY_RUN text per spec section 22.
 * @param {'CREATE_TASK'|'ROUTE_MEETING'|'APPEND_CARRY_IN'|'SKIP_DONE'|'DEFER_CUTOFF'} kind
 * @param {{occurrenceId?:string, docId?:string}} [ctx]
 * @returns {string}
 */
export function dryRunMessage(kind, ctx = {}) {
  switch (kind) {
    case 'CREATE_TASK': return 'Would create Task';
    case 'ROUTE_MEETING': return `Would route to NCMMS Core occurrence ${ledgerRequire(ctx.occurrenceId, 'occurrenceId')}`;
    case 'APPEND_CARRY_IN': return `Would append carry-in to Doc ${maskId(ledgerRequire(ctx.docId, 'docId'))}`;
    case 'SKIP_DONE': return 'Would skip because already processed';
    case 'DEFER_CUTOFF': return 'Would defer because cutoff passed';
    default: throw new Error(`Unknown dry-run kind: ${String(kind)}`);
  }
}

/**
 * Decides what to do with an operation given its existing ledger row.
 * @param {object|null} existingRow
 * @param {Date|string|number} now
 * @param {{staleMinutes?:number, dryRun?:boolean}} [opts]
 * @returns {{action:string, reason:string}}
 */
export function decideOperation(existingRow, now, opts = {}) {
  const staleMinutes = opts.staleMinutes === undefined ? LEDGER_DEFAULT_STALE_MINUTES : opts.staleMinutes;
  const nowMs = new Date(ledgerIso(now)).getTime();
  let action;
  let reason;
  const status = existingRow ? existingRow.Status : '';
  if (!existingRow || status === LEDGER_STATUS.DRY_RUN || status === '') {
    action = 'PROCEED';
    reason = 'No prior operation recorded';
  } else if (status === LEDGER_STATUS.DONE || status === LEDGER_STATUS.SKIPPED) {
    action = 'SKIP_DONE';
    reason = 'Already processed';
  } else if (status === LEDGER_STATUS.PENDING) {
    const updatedMs = new Date(ledgerIso(existingRow.UpdatedAt || existingRow.CreatedAt)).getTime();
    const ageMin = (nowMs - updatedMs) / 60000;
    if (ageMin >= staleMinutes) {
      action = 'RETRY';
      reason = `Pending operation stale (${Math.floor(ageMin)} min)`;
    } else {
      action = 'WAIT_IN_FLIGHT';
      reason = 'Operation in flight';
    }
  } else if (status === LEDGER_STATUS.ERROR) {
    action = 'RETRY';
    reason = 'Previous attempt failed';
  } else if (status === LEDGER_STATUS.DEFERRED) {
    action = 'PROCEED';
    reason = 'Previously deferred';
  } else {
    throw new Error(`Unknown ledger status: ${String(status)}`);
  }
  if (opts.dryRun) return { action: `WOULD_${action}`, reason };
  return { action, reason };
}

/**
 * Creates a PENDING row for a new operation.
 * @param {{opKey:string, sourceType:string, sourceId:string, sourceVersion?:string, action:string, targetType?:string, metadata?:object}} op
 * @param {Date|string|number} now
 * @returns {object} ledger row
 */
export function beginOp(op, now) {
  const at = ledgerIso(now);
  const row = ledgerBlankRow();
  row.OperationKey = ledgerRequire(op && op.opKey, 'opKey');
  row.SourceType = ledgerRequire(op.sourceType, 'sourceType');
  row.SourceId = ledgerRequire(op.sourceId, 'sourceId');
  row.SourceVersion = op.sourceVersion || '';
  row.Action = ledgerRequire(op.action, 'action');
  row.TargetType = op.targetType || '';
  row.Status = LEDGER_STATUS.PENDING;
  row.CreatedAt = at;
  row.UpdatedAt = at;
  row.MetadataJson = ledgerJson(op.metadata);
  return row;
}

function ledgerTransition(row, now, fields) {
  if (!row || row.Status !== LEDGER_STATUS.PENDING) {
    throw new Error(`Illegal ledger transition: row must be PENDING (was ${row ? row.Status : 'missing'})`);
  }
  return { ...row, ...fields, UpdatedAt: ledgerIso(now) };
}

/** PENDING -> DONE */
export function completeOp(row, now, result = {}) {
  const fields = { Status: LEDGER_STATUS.DONE, ErrorCode: '', ErrorMessage: '' };
  if (result.targetId) fields.TargetId = result.targetId;
  if (result.targetType) fields.TargetType = result.targetType;
  if (result.metadata) fields.MetadataJson = ledgerJson(result.metadata);
  return ledgerTransition(row, now, fields);
}

/** PENDING -> ERROR with sanitized message. */
export function failOp(row, now, error) {
  const code = error && typeof error === 'object' && error.code ? String(error.code) : 'ERROR';
  const failed = ledgerTransition(row, now, {
    Status: LEDGER_STATUS.ERROR,
    ErrorCode: sanitizeError(code, 40),
    ErrorMessage: sanitizeError(error)
  });
  const meta = ledgerParseMeta(row);
  const attempts = (Number(meta.attempts) || 0) + 1;
  const permanent = (error && typeof error === 'object' && error.retryable === false) || LEDGER_PERMANENT_CODES.includes(code);
  meta.attempts = attempts;
  meta.retryable = !permanent;
  if (permanent) delete meta.nextRetryAt;
  else meta.nextRetryAt = new Date(new Date(ledgerIso(now)).getTime() + retryBackoffMinutes(attempts) * 60000).toISOString();
  failed.MetadataJson = JSON.stringify(meta);
  return failed;
}

/** PENDING -> DEFERRED */
export function deferOp(row, now, reason) {
  return ledgerTransition(row, now, {
    Status: LEDGER_STATUS.DEFERRED,
    ErrorCode: sanitizeError(reason || 'DEFERRED', 40),
    ErrorMessage: ''
  });
}

function ledgerDryMessages(op, action) {
  if (action === 'WOULD_SKIP_DONE') return [dryRunMessage('SKIP_DONE')];
  if (action === 'WOULD_PROCEED' || action === 'WOULD_RETRY') {
    if (op.deferReason) return [dryRunMessage('DEFER_CUTOFF')];
    if (op.kind === 'MEETING') {
      return [dryRunMessage('ROUTE_MEETING', op), dryRunMessage('APPEND_CARRY_IN', op)];
    }
    return [dryRunMessage('CREATE_TASK')];
  }
  return [];
}

/**
 * Claims an operation under the lock: read ledger, decide, write PENDING (or DEFERRED).
 * DRY_RUN performs no lock, no write.
 * @param {{store:{get:Function,put:Function}, lock:{tryLock:Function,releaseLock:Function}, clock:Function, op:object, staleMinutes?:number, dryRun?:boolean, lockWaitMs?:number}} a
 * @returns {{action:string, reason:string, row:object|null, messages:string[]}}
 */
export function claimOperation(a) {
  const { store, lock, clock, op } = a;
  const now = clock();
  if (a.dryRun) {
    const d = decideOperation(store.get(op.opKey), now, { staleMinutes: a.staleMinutes, dryRun: true });
    const action = op.deferReason && d.action !== 'WOULD_SKIP_DONE' ? 'WOULD_DEFER' : d.action;
    return { action, reason: d.reason, row: null, messages: ledgerDryMessages(op, d.action) };
  }
  if (!lock.tryLock(a.lockWaitMs === undefined ? LEDGER_DEFAULT_LOCK_WAIT_MS : a.lockWaitMs)) {
    return { action: 'WAIT_IN_FLIGHT', reason: 'Lock busy', row: null, messages: [] };
  }
  try {
    const existing = store.get(op.opKey);
    const d = decideOperation(existing, now, { staleMinutes: a.staleMinutes });
    if (d.action === 'SKIP_DONE' || d.action === 'WAIT_IN_FLIGHT') {
      return { action: d.action, reason: d.reason, row: existing, messages: [] };
    }
    const fresh = beginOp(op, now);
    const row = existing && existing.CreatedAt ? { ...fresh, CreatedAt: existing.CreatedAt } : fresh;
    const priorAttempts = Number(ledgerParseMeta(existing).attempts) || 0;
    if (priorAttempts > 0) row.MetadataJson = JSON.stringify({ ...ledgerParseMeta(row), attempts: priorAttempts });
    if (op.deferReason) {
      const deferred = deferOp(row, now, op.deferReason);
      store.put(deferred);
      return { action: 'DEFER', reason: String(op.deferReason), row: deferred, messages: [] };
    }
    store.put(row);
    return { action: d.action, reason: d.reason, row, messages: [] };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Claims then runs work(), recording DONE or a sanitized ERROR. work returns
 * {targetId?, targetType?, metadata?}. A failure to write the DONE row propagates (the PENDING
 * row then goes stale and the retry must be idempotent via the target's own op-key).
 * @param {object} a claimOperation args plus work
 * @returns {{ok:boolean, action:string, reason?:string, row:object|null, messages:string[], retryable?:boolean, errorCode?:string}}
 */
export function runOperation(a) {
  const claim = claimOperation(a);
  const proceeding = claim.action === 'PROCEED' || claim.action === 'RETRY';
  if (!proceeding) {
    return { ok: !claim.action.startsWith('ERROR'), ...claim };
  }
  let result;
  try {
    result = a.work({ row: claim.row, retry: claim.action === 'RETRY' }) || {};
  } catch (err) {
    const failed = failOp(claim.row, a.clock(), err);
    a.store.put(failed);
    return {
      ok: false,
      action: 'ERROR',
      reason: failed.ErrorMessage,
      row: failed,
      messages: [],
      retryable: !(err && typeof err === 'object' && err.retryable === false),
      errorCode: failed.ErrorCode
    };
  }
  const done = completeOp(claim.row, a.clock(), result);
  a.store.put(done);
  return { ok: true, action: 'DONE', reason: '', row: done, messages: [] };
}
