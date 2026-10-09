/**
 * @file hubMock.js
 * @description Local mock of the Gmail/Meeting Hub server RPCs (Phase 28) so the Triage and
 * Meeting Prep views can be reviewed in mock mode without Google. State-changing calls are
 * idempotent by operation key, mirroring the real ledger: a repeated call returns the same
 * result and never creates a second mock task.
 */
import { gmailTaskKey, gmailWaitingKey, gmailMeetingKey } from './integration/contracts.js';

const GMAIL_BASE = 'https:' + '/' + '/mail.google.com/mail/u/0/#all/';
const DOCS_BASE = 'https:' + '/' + '/docs.google.com/document/d/';

/**
 * Local-time ISO-like string offset from now, no UTC conversion of local fields.
 * @param {number} deltaMin Minutes from now.
 * @returns {string} YYYY-MM-DDTHH:MM:00 in local time.
 */
function localIso(deltaMin) {
  const d = new Date(Date.now() + deltaMin * 60000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

function thread(id, subject, from, ageMin, score, signals, labels, dest) {
  return {
    threadId: id,
    subject,
    from,
    date: localIso(-ageMin),
    score,
    signals,
    labels,
    suggestedDestinations: dest,
    gmailUrl: GMAIL_BASE + id
  };
}

function buildThreads() {
  return {
    directAction: [
      thread('t-1001', 'Approval needed: COR designation for TRM task order', 'Dana Whitfield', 95, 10,
        ['To: you', 'Explicit request', 'Deadline language', 'No reply yet'], ['_NCMMS/Approval-Request', '00_AR'],
        [{ seriesKey: 'NCMMS_CORE', reason: '_NCMMS/Approval-Request label' }]),
      thread('t-1002', 'Can you confirm the Q3 elevator data feed owner?', 'Priya Raman', 240, 8,
        ['To: you', 'Explicit request', 'Latest from other'], ['Elevator'],
        [{ seriesKey: 'ELEVATOR_DATA', reason: 'Elevator label' }]),
      thread('t-1003', 'Re: Acquisition package: draft SOW comments', 'Marcus Lee', 600, 6,
        ['Latest from other', 'VIP label'], ['_NCMMS/Acquisition', 'VIP'],
        [{ seriesKey: 'NCMMS_ACQ', reason: '_NCMMS/Acquisition label' }]),
      thread('t-1004', 'Facilities tech survey results, your review please', 'Hannah Ortiz', 1500, 5,
        ['To: you', 'Explicit request'], ['P&S Tech & Innovation'],
        [{ seriesKey: 'FACILITY_TECH', reason: 'P&S Tech & Innovation label' }])
    ],
    meetingCarryIns: [
      thread('t-2001', 'NCMMS Core: open items on cutover schedule', 'Ravi Menon', 180, 7,
        ['Latest from other', 'VIP label'], ['_NCMMS', '🎯/Meeting/NCMMS-Core'],
        [{ seriesKey: 'NCMMS_CORE', reason: '🎯/Meeting/NCMMS-Core label' }]),
      thread('t-2002', 'TRM project status: vendor invoice question', 'Elena Park', 420, 4,
        ['Latest from other'], ['_NCMMS/COR-TRM'],
        [{ seriesKey: 'TRM_PM', reason: '_NCMMS/COR-TRM label' }, { seriesKey: 'NCMMS_CORE', reason: 'Fallback for COR-TRM' }]),
      thread('t-2003', 'ncmms-support: unresolved work order sync exception', 'Support Desk', 55, 3,
        ['Known system sender'], ['_NCMMS/ncmms-support'],
        [{ seriesKey: 'NCMMS_DAILY', reason: 'Unresolved exception' }])
    ],
    systemExceptions: [
      thread('t-3001', 'Jira: 6 NCMMS issues changed state (digest)', 'Jira', 30, -2,
        ['Known automated sender'], ['Jira', '_NCMMS'],
        [{ seriesKey: 'NCMMS_DAILY', reason: 'Jira plus NCMMS context' }]),
      thread('t-3002', 'ServiceNow: INC0045122 assigned to your group', 'ServiceNow', 130, -1,
        ['Known automated sender'], ['ServiceNow'], []),
      thread('t-3003', 'Apps Script: Summary of failed executions', 'Apps Script', 700, -4,
        ['Known automated sender', 'Automation label'], ['Apps Script'], []),
      thread('t-3004', 'Elevator notification: Unit 3 out of service', 'Facility Alerts', 900, -4,
        ['Known automated sender', 'Elevator'], ['Elevator'],
        [{ seriesKey: 'ELEVATOR_DATA', reason: 'Elevator, exceptions only' }])
    ],
    fyiReading: [
      thread('t-4001', 'Weekly federal IT news digest', 'FedScoop Newsletter', 300, 1,
        ['Likely FYI'], ['News', 'FYI'], []),
      thread('t-4002', 'FYI: updated parking guidance for HQ', 'Facilities Office', 1200, 2,
        ['User only copied'], ['FYI_Candidate'], []),
      thread('t-4003', 'Auto-filed: monthly usage report', 'Reports Mailer', 2000, 0,
        ['Auto-file'], ['Auto-file'], [])
    ]
  };
}

function buildCarryIns() {
  return [
    { text: 'Decision needed: confirm cutover date for NCMMS Core (Ravi Menon)', gmailUrl: GMAIL_BASE + 't-2001', status: 'DONE' },
    { text: 'Input needed: vendor invoice question on TRM task order (Elena Park)', gmailUrl: GMAIL_BASE + 't-2002', status: 'DRY_RUN' },
    { text: 'FYI: SOW comments from acquisition (Marcus Lee)', gmailUrl: GMAIL_BASE + 't-1003', status: 'DONE' }
  ];
}

/**
 * Stateful mock of the hub server surface.
 */
export class HubMock {
  /**
   * @param {{dryRun?: boolean, flags?: object}} [opts] dryRun defaults to false so mock writes
   * reach DONE; the real server defaults DRY_RUN ON.
   */
  constructor(opts = {}) {
    this.flags = {
      GMAIL_ROUTER: true,
      TRIAGE_BOARD: true,
      NCMMS_CORE_PILOT: true,
      GEMINI_DISCOVERY: false,
      GEMINI_RECONCILIATION: false,
      USAI_ASSIST: false,
      ...(opts.flags || {})
    };
    this.dryRun = opts.dryRun === true;
    this.queues = buildThreads();
    this.ledger = new Map();
    this.threadOps = new Map();
    this.tasks = [];
    this.waiting = [];
    this.dismissed = new Set();
    this.carryIns = buildCarryIns();
    this.failNext = new Set();
    this.lastRun = localIso(-7);
    // Fixture ledger rows so every status renders in review.
    this._seedLedger('t-1003', 'DONE');
    this._seedLedger('t-1004', 'ERROR');
    this._seedLedger('t-2002', 'DRY_RUN');
    this._seedLedger('t-4002', 'DEFERRED');
  }

  _seedLedger(threadId, status) {
    const operationKey = `GMAIL|${threadId}|TASK`;
    this.threadOps.set(threadId, { status, operationKey });
    this.ledger.set(operationKey, { status, threadId });
  }

  _find(threadId) {
    for (const key of Object.keys(this.queues)) {
      const hit = this.queues[key].find((t) => t.threadId === threadId);
      if (hit) return hit;
    }
    return null;
  }

  _result(ok, message, extra = {}) {
    return { ok, message, ...extra };
  }

  /**
   * Shared idempotent write path: one ledger row and one side effect per operation key.
   * @param {string} threadId Source thread.
   * @param {string} key Operation key.
   * @param {Function} sideEffect Runs once when the op is first applied (skipped in dry run).
   * @param {string} doneMsg Message on success.
   * @param {string} dryMsg Message in dry run.
   * @returns {object} Result contract.
   */
  _apply(threadId, key, sideEffect, doneMsg, dryMsg) {
    const src = this._find(threadId);
    if (!src) return this._result(false, 'Thread not found in current triage set', { errorCode: 'NOT_FOUND' });
    const existing = this.ledger.get(key);
    const sourceUrl = src.gmailUrl;
    if (existing && existing.status === 'DONE') {
      return this._result(true, 'Already processed', { operationKey: key, sourceUrl, targetUrl: existing.targetUrl });
    }
    if (this.failNext.delete(key)) {
      this.ledger.set(key, { status: 'ERROR', threadId });
      this.threadOps.set(threadId, { status: 'ERROR', operationKey: key });
      return this._result(false, 'Simulated failure', { operationKey: key, sourceUrl, errorCode: 'MOCK_FAILURE' });
    }
    if (this.dryRun) {
      this.ledger.set(key, { status: 'DRY_RUN', threadId });
      this.threadOps.set(threadId, { status: 'DRY_RUN', operationKey: key });
      return this._result(true, dryMsg, { operationKey: key, sourceUrl });
    }
    const targetUrl = sideEffect();
    this.ledger.set(key, { status: 'DONE', threadId, targetUrl });
    this.threadOps.set(threadId, { status: 'DONE', operationKey: key });
    return this._result(true, doneMsg, { operationKey: key, sourceUrl, targetUrl });
  }

  getHubStatus() {
    const counts = { DONE: 0, ERROR: 0, DEFERRED: 0, DRY_RUN: 0 };
    this.ledger.forEach((row) => { if (counts[row.status] !== undefined) counts[row.status] += 1; });
    return { flags: { ...this.flags }, dryRun: this.dryRun, lastRun: this.lastRun, counts };
  }

  getTriageBoard(filters = {}) {
    const text = (filters && filters.text ? String(filters.text) : '').trim().toLowerCase();
    const queues = {};
    Object.keys(this.queues).forEach((key) => {
      queues[key] = this.queues[key]
        .filter((t) => !this.dismissed.has(t.threadId))
        .filter((t) => !text || t.subject.toLowerCase().includes(text) || t.from.toLowerCase().includes(text))
        .map((t) => ({
          ...t,
          signals: [...t.signals],
          labels: [...t.labels],
          suggestedDestinations: t.suggestedDestinations.map((d) => ({ ...d })),
          ledgerStatus: (this.threadOps.get(t.threadId) || {}).status || null,
          operationKey: (this.threadOps.get(t.threadId) || {}).operationKey || null
        }));
    });
    return { queues };
  }

  getUpcomingMeetingChoices(threadId) {
    const src = this._find(threadId);
    const seriesKey = (src && src.suggestedDestinations[0] && src.suggestedDestinations[0].seriesKey) || 'NCMMS_CORE';
    const choices = [
      { occurrenceId: `${seriesKey}-occ-1`, start: localIso(26 * 60), label: 'Next occurrence' },
      { occurrenceId: `${seriesKey}-occ-2`, start: localIso(7 * 24 * 60 + 26 * 60), label: 'Following week' },
      { occurrenceId: `${seriesKey}-occ-3`, start: localIso(14 * 24 * 60 + 26 * 60), label: 'Two weeks out' }
    ];
    return {
      recommended: { occurrenceId: choices[0].occurrenceId, start: choices[0].start, reason: 'Next occurrence before cutoff' },
      choices,
      backlogSeriesKey: seriesKey
    };
  }

  routeThreadToTask(threadId, opts = {}) {
    const today = !!(opts && opts.today);
    const key = gmailTaskKey(threadId, today);
    const src = this._find(threadId);
    return this._apply(threadId, key, () => {
      const id = `mock-task-${this.tasks.length + 1}`;
      this.tasks.push({
        id, key, threadId, today,
        title: `[${(opts && opts.priority) || 'B1'}] ${src.subject}`,
        priority: (opts && opts.priority) || 'B1'
      });
      return 'https:' + '/' + '/tasks.google.com/mock/' + id;
    }, today ? 'Task created for today' : 'Task created', 'Would create Task');
  }

  routeThreadToWaiting(threadId, opts = {}) {
    const key = gmailWaitingKey(threadId);
    const src = this._find(threadId);
    return this._apply(threadId, key, () => {
      const id = `mock-wait-${this.waiting.length + 1}`;
      this.waiting.push({ id, key, threadId, title: `[Waiting] ${src.subject}`, waitingOn: (opts && opts.waitingOn) || '', nagDate: (opts && opts.nagDate) || null });
      return 'https:' + '/' + '/tasks.google.com/mock/' + id;
    }, 'Waiting item created', 'Would create Task');
  }

  routeThreadToMeeting(threadId, occurrenceId, opts = {}) {
    if (!occurrenceId || String(occurrenceId).includes('|')) {
      return this._result(false, 'A valid occurrence is required', { errorCode: 'BAD_OCCURRENCE' });
    }
    const key = gmailMeetingKey(threadId, occurrenceId);
    const src = this._find(threadId);
    return this._apply(threadId, key, () => {
      this.carryIns.push({
        text: `${(opts && opts.framing) || 'Input needed'}: ${src.subject} (${src.from})`,
        gmailUrl: src.gmailUrl,
        status: 'DONE'
      });
      return DOCS_BASE + 'mock-notes-doc/edit';
    }, 'Carry-in appended to meeting notes', 'Would append carry-in to Doc mock...');
  }

  dismissTriageItem(threadId) {
    if (!this._find(threadId)) return this._result(false, 'Thread not found in current triage set', { errorCode: 'NOT_FOUND' });
    this.dismissed.add(threadId);
    return this._result(true, 'Dismissed from triage set (Gmail untouched)', { operationKey: `GMAIL|${threadId}|DISMISS` });
  }

  retryFailedOperation(operationKey) {
    const row = this.ledger.get(operationKey);
    if (!row || row.status !== 'ERROR') {
      return this._result(false, 'No failed operation to retry', { operationKey, errorCode: 'NOT_RETRYABLE' });
    }
    this.ledger.delete(operationKey);
    row.status = 'DONE';
    this.ledger.set(operationKey, row);
    this.threadOps.set(row.threadId, { status: 'DONE', operationKey });
    return this._result(true, 'Retry succeeded', { operationKey, sourceUrl: (this._find(row.threadId) || {}).gmailUrl });
  }

  getMeetingPrep(seriesKey, occurrenceId) {
    const key = seriesKey || 'NCMMS_CORE';
    const carryIns = this.carryIns.map((c) => ({ ...c }));
    return {
      title: key === 'NCMMS_CORE' ? 'NCMMS Core Weekly' : key,
      seriesKey: key,
      occurrenceId: occurrenceId || `${key}-occ-1`,
      start: localIso(26 * 60),
      cutoff: localIso(18 * 60),
      carryIns,
      carryInCount: carryIns.length,
      agenda: ['Cutover schedule status', 'Open approvals and COR designations', 'Vendor invoice questions', 'Risks and blockers'],
      notesDocUrl: DOCS_BASE + 'mock-notes-doc/edit',
      status: this.dryRun ? 'DRY_RUN' : 'READY'
    };
  }
}
