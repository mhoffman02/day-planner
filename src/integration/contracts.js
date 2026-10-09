/**
 * @file contracts.js
 * @description Shared constants and typed shapes for the Gmail/Calendar/Tasks/Meeting-Notes hub (Phase 28).
 * Single source of truth: every engine, the Engines.gs build output, and the UI read these values.
 * Pure data and pure functions only (no Google services, no Date.now) so it runs in node and GAS.
 */

export const EVENT_TYPE = Object.freeze({
  MEETING: 'MEETING',
  PREP: 'PREP',
  FOLLOWUP: 'FOLLOWUP',
  FOCUS: 'FOCUS',
  ROUTINE: 'ROUTINE',
  TASK_DUE: 'TASK_DUE',
  LEAVE: 'LEAVE',
  AVAILABILITY: 'AVAILABILITY',
  INFORMATIONAL: 'INFORMATIONAL'
});

/** Workflow label prefix (user applies these by hand; the app never writes Gmail). */
export const LABEL_PREFIX = '🎯/';

export const WORKFLOW_LABEL = Object.freeze({
  TASK: LABEL_PREFIX + 'Task',
  TASK_TODAY: LABEL_PREFIX + 'Task-Today',
  WAITING: LABEL_PREFIX + 'Waiting',
  MEETING: LABEL_PREFIX + 'Meeting',
  MEETING_NCMMS_CORE: LABEL_PREFIX + 'Meeting/NCMMS-Core',
  MEETING_NCMMS_DAILY: LABEL_PREFIX + 'Meeting/NCMMS-Daily',
  READ: LABEL_PREFIX + 'Read',
  REVIEW: LABEL_PREFIX + 'Review'
});

/** Labels the router acts on in v1 (others are recognized but inert). */
export const ACTIVE_LABELS = Object.freeze([
  WORKFLOW_LABEL.TASK,
  WORKFLOW_LABEL.TASK_TODAY,
  WORKFLOW_LABEL.WAITING,
  WORKFLOW_LABEL.MEETING_NCMMS_CORE
]);

/** Ledger statuses (replace the spec's _DP/Processed and _DP/Error Gmail labels). */
export const LEDGER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  DONE: 'DONE',
  ERROR: 'ERROR',
  SKIPPED: 'SKIPPED',
  DEFERRED: 'DEFERRED',
  DRY_RUN: 'DRY_RUN'
});

export const LEDGER_COLUMNS = Object.freeze([
  'OperationKey', 'SourceType', 'SourceId', 'SourceVersion', 'Action', 'TargetType', 'TargetId',
  'Status', 'CreatedAt', 'UpdatedAt', 'ErrorCode', 'ErrorMessage', 'MetadataJson'
]);

export const REGISTRY_COLUMNS = Object.freeze([
  'Enabled', 'SeriesKey', 'DisplayName', 'CalendarId', 'RecurringEventId', 'TitleFallback',
  'MeetingRole', 'PrepMinutes', 'PostReviewMinutes', 'HumanNotesDocId', 'GeminiExpected',
  'AIAllowed', 'LabelHints'
]);

/** Feature flags default; real values come from the Config tab. */
export const DEFAULT_FEATURES = Object.freeze({
  GMAIL_ROUTER: false,
  TRIAGE_BOARD: false,
  NCMMS_CORE_PILOT: false,
  GEMINI_DISCOVERY: false,
  GEMINI_RECONCILIATION: false,
  USAI_ASSIST: false,
  DRY_RUN: true
});

/** Labels whose content must never reach any AI integration. */
export const AI_EXCLUDED_LABELS = Object.freeze([
  'HR/', '_NCMMS/OIG Audit', '_NCMMS/Acquisition', 'FOIA'
]);

/**
 * Operation keys (idempotency identity = source + action + target, never "processed once").
 * @param {string} threadId
 * @returns {string}
 */
export function gmailTaskKey(threadId, today = false) {
  return `GMAIL|${requirePart(threadId, 'threadId')}|${today ? 'TASK_TODAY' : 'TASK'}`;
}
export function gmailWaitingKey(threadId) {
  return `GMAIL|${requirePart(threadId, 'threadId')}|WAITING`;
}
export function gmailMeetingKey(threadId, occurrenceEventId) {
  return `GMAIL|${requirePart(threadId, 'threadId')}|MEETING|${requirePart(occurrenceEventId, 'occurrenceEventId')}`;
}
export function geminiProposeKey(docId, contentHash) {
  return `GEMINI|${requirePart(docId, 'docId')}|${requirePart(contentHash, 'contentHash')}|PROPOSE_ACTION`;
}
export function meetingTaskKey(occurrenceEventId, actionHash) {
  return `MEETING|${requirePart(occurrenceEventId, 'occurrenceEventId')}|TASK|${requirePart(actionHash, 'actionHash')}`;
}

function requirePart(value, name) {
  if (typeof value !== 'string' || value === '' || value.includes('|')) {
    throw new Error(`Invalid operation-key part ${name}: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Structured result every state-changing server call returns.
 * @param {{ok:boolean, operationKey?:string, status?:string, sourceUrl?:string, targetUrl?:string, message:string, errorCode?:string}} r
 */
export function makeResult(r) {
  if (typeof r.ok !== 'boolean' || typeof r.message !== 'string') {
    throw new Error('makeResult requires boolean ok and string message');
  }
  return Object.freeze({ ...r });
}
