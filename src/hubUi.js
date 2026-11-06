/**
 * @file hubUi.js
 * @description Pure helpers for the Gmail/Meeting Hub views (Triage board + Meeting Prep):
 * feature-flag visibility, score band labels, ledger status presentation, cutoff countdown.
 * gas-app/Script.html carries a mirrored copy (GAS cannot import modules); tests/hubUi.test.js
 * asserts both copies agree.
 */

export const HUB_VIEW_TRIAGE = 'triage';
export const HUB_VIEW_MEETING_PREP = 'meetingPrep';

export const QUEUE_ORDER = ['directAction', 'meetingCarryIns', 'systemExceptions', 'fyiReading'];

export const QUEUE_TITLES = {
  directAction: 'Direct Action',
  meetingCarryIns: 'Meeting Carry-ins',
  systemExceptions: 'System Exceptions',
  fyiReading: 'FYI / Reading'
};

/**
 * Whether a hub view may appear in navigation. Default hidden: any missing flag means hidden.
 * @param {string} viewName HUB_VIEW_TRIAGE or HUB_VIEW_MEETING_PREP.
 * @param {object|null|undefined} flags Flags from getHubStatus().
 * @returns {boolean}
 */
export function isHubViewVisible(viewName, flags) {
  if (!flags || flags.GMAIL_ROUTER !== true) return false;
  if (viewName === HUB_VIEW_TRIAGE) return flags.TRIAGE_BOARD === true;
  if (viewName === HUB_VIEW_MEETING_PREP) return flags.NCMMS_CORE_PILOT === true;
  return false;
}

/**
 * Human label for a deterministic triage score (spec section 11 bands).
 * @param {number} score Numeric score.
 * @returns {string} Band label.
 */
export function scoreBandLabel(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return 'Unscored';
  if (score >= 8) return 'High confidence';
  if (score >= 4) return 'Human review';
  if (score >= 0) return 'Likely FYI';
  return 'Noise';
}

const LEDGER_LABELS = {
  DONE: 'Done',
  ERROR: 'Failed',
  DEFERRED: 'Deferred',
  DRY_RUN: 'Trial only, nothing created',
  PENDING: 'In progress',
  SKIPPED: 'Already done'
};
const LEDGER_LABELS_BY_KIND = {
  DONE: { TASK_TODAY: 'Task added for today', TASK: 'Added to Master Tasks', DECISION: 'Decision added to Master Tasks', WAITING: 'Waiting item added', MEETING: 'Added to meeting notes', DISMISS: 'Dismissed' },
  SKIPPED: { TASK_TODAY: 'Task already added', TASK: 'Task already added', DECISION: 'Decision already added', WAITING: 'Waiting item already added', MEETING: 'Already in meeting notes', DISMISS: 'Already dismissed' }
};

/**
 * @param {string|null|undefined} operationKey Ledger key, e.g. GMAIL|threadId|TASK_TODAY.
 * @returns {string} The operation kind, or '' when the key is not a Gmail operation.
 */
export function ledgerOperationKind(operationKey) {
  const parts = String(operationKey || '').split('|');
  return parts[0] === 'GMAIL' ? (parts[2] || '') : '';
}

/**
 * Display text for a ledger status, saying what the hub did when the operation key tells which action it was;
 * empty string when the item has no ledger row.
 * @param {string|null|undefined} status Ledger status.
 * @param {string|null} [operationKey] Ledger key of the row.
 * @returns {string}
 */
export function ledgerStatusLabel(status, operationKey) {
  if (!status) return '';
  const byKind = Object.prototype.hasOwnProperty.call(LEDGER_LABELS_BY_KIND, status) ? LEDGER_LABELS_BY_KIND[status] : {};
  const kind = ledgerOperationKind(operationKey);
  if (Object.prototype.hasOwnProperty.call(byKind, kind)) return byKind[kind];
  return LEDGER_LABELS[status] || String(status);
}

/**
 * Only ERROR rows are retryable.
 * @param {string|null|undefined} status Ledger status.
 * @returns {boolean}
 */
export function canRetryLedger(status) {
  return status === 'ERROR';
}

/**
 * Countdown text to a prep cutoff, e.g. "in 2 h 15 min" or "passed 40 min ago".
 * @param {string} cutoffIso Cutoff timestamp (ISO, local time ok).
 * @param {number} [nowMs=Date.now()] Current time in ms.
 * @returns {string}
 */
export function formatCutoffCountdown(cutoffIso, nowMs = Date.now()) {
  const t = new Date(cutoffIso).getTime();
  if (!cutoffIso || Number.isNaN(t)) return 'No cutoff';
  const diffMin = Math.round((t - nowMs) / 60000);
  if (diffMin === 0) return 'now';
  const abs = Math.abs(diffMin);
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const mins = abs % 60;
  let span;
  if (days > 0) span = `${days} d ${hours} h`;
  else if (hours > 0) span = `${hours} h ${mins} min`;
  else span = `${mins} min`;
  return diffMin > 0 ? `in ${span}` : `passed ${span} ago`;
}

/**
 * Total item count across all four queues.
 * @param {{queues?: object}|null} board Board payload.
 * @returns {number}
 */
export function countBoardItems(board) {
  if (!board || !board.queues) return 0;
  return QUEUE_ORDER.reduce((n, key) => n + ((board.queues[key] || []).length), 0);
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Local-time label like "Nov 6, 2026 4:29 pm" for a stored timestamp (server stamps are UTC ISO).
 * @param {string|null|undefined} iso ISO timestamp; one without an offset is read as local time.
 * @returns {string} The label, or '' when empty or unparseable.
 */
export function formatLocalDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  return MONTH_ABBR[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ' ' + (h % 12 || 12) + ':' + min + ' ' + (h < 12 ? 'am' : 'pm');
}

/** Triage Doc-items display limit when none, or an unknown one, is saved. */
export const DOC_ROW_LIMIT_DEFAULT = 25;
/** The choices offered by the Show: toggles; 'all' disables the limit. */
export const DOC_ROW_LIMITS = [10, 25, 50, 'all'];

/**
 * Reads the hub feature flags saved by the last successful status load, so Triage and Meeting Prep
 * tabs can show at first paint. Anything that is not a plain object of booleans is rejected.
 * @param {string|null|undefined} raw The saved JSON text.
 * @returns {Object<string, boolean>|null} The flags, or null when nothing usable is saved.
 */
export function parseSavedHubFlags(raw) {
  if (typeof raw !== 'string' || raw === '') return null;
  let v;
  try {
    v = JSON.parse(raw);
  } catch (err) {
    console.error('parseSavedHubFlags: saved hub flags are not valid JSON, ignoring them:', err.stack);
    return null;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return Object.keys(v).every((k) => typeof v[k] === 'boolean') ? v : null;
}

/**
 * Orders Doc action rows by their comment date; undated rows (file-level fallbacks) always go last.
 * @param {Array<object>} rows Doc rows.
 * @param {string} [dir] 'desc' (newest first, the default) or 'asc' (oldest first).
 * @returns {Array<object>} A new sorted array.
 */
export function sortDocRows(rows, dir) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  const sign = dir === 'asc' ? 1 : -1;
  const t = (r) => Date.parse(r && r.date);
  return list.sort((a, b) => {
    const ta = t(a);
    const tb = t(b);
    const na = Number.isNaN(ta);
    const nb = Number.isNaN(tb);
    if (na || nb) return na === nb ? 0 : (na ? 1 : -1);
    return ta === tb ? 0 : sign * (ta - tb);
  });
}

/**
 * Ids of Doc rows whose comment is older than a number of days; undated rows are never picked.
 * @param {Array<object>} rows Doc rows.
 * @param {number} days Age in days, > 0.
 * @param {number} nowMs Current time in ms.
 * @returns {Array<string>} itemIds to dismiss.
 */
export function docRowsOlderThan(rows, days, nowMs) {
  if (!Array.isArray(rows) || !(days > 0)) return [];
  const cutoff = nowMs - days * 86400000;
  return rows.filter((r) => Date.parse(r && r.date) < cutoff).map((r) => r.itemId);
}

/**
 * Display limit for Doc action rows (client side only; the server list and its cache stay whole).
 * @param {Array<object>} rows Rows already in display order (newest first).
 * @param {number|string} limit 10, 25, 50 or 'all'; anything else falls back to DOC_ROW_LIMIT_DEFAULT.
 * @returns {{rows: Array<object>, hidden: number}} The first N rows and how many were left out.
 */
export function limitDocRows(rows, limit) {
  const list = Array.isArray(rows) ? rows : [];
  if (typeof limit === 'string' && limit.toLowerCase() === 'all') return { rows: list, hidden: 0 };
  const n = DOC_ROW_LIMITS.includes(limit) ? limit : DOC_ROW_LIMIT_DEFAULT;
  return { rows: list.slice(0, n), hidden: Math.max(0, list.length - n) };
}
