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
  return ledgerTransition(row, now, {
    Status: LEDGER_STATUS.ERROR,
    ErrorCode: sanitizeError(code, 40),
    ErrorMessage: sanitizeError(error)
  });
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
