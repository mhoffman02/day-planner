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
  DONE: { TASK_TODAY: 'Task added for today', TASK: 'Added to Master Tasks', WAITING: 'Waiting item added', MEETING: 'Added to meeting notes', DISMISS: 'Dismissed' },
  SKIPPED: { TASK_TODAY: 'Task already added', TASK: 'Task already added', WAITING: 'Waiting item already added', MEETING: 'Already in meeting notes', DISMISS: 'Already dismissed' }
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
