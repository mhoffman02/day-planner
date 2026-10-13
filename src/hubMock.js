/**
 * @file hubMock.js
 * @description Local mock of the Gmail/Meeting Hub server RPCs (Phase 28) so the Triage and
 * Meeting Prep views can be reviewed in mock mode without Google. State-changing calls are
 * idempotent by operation key, mirroring the real ledger: a repeated call returns the same
 * result and never creates a second mock task.
 */
import { gmailTaskKey, gmailWaitingKey, gmailMeetingKey, DEFAULT_FEATURES } from './integration/contracts.js';
import { TRIAGE_BAND } from './integration/triageScore.js';

const GMAIL_BASE = 'https:' + '/' + '/mail.google.com/mail/#all/';
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

function bandFor(score) {
  if (score >= 8) return TRIAGE_BAND.HIGH_CONFIDENCE;
  if (score >= 4) return TRIAGE_BAND.HUMAN_REVIEW;
  if (score >= 0) return TRIAGE_BAND.LIKELY_FYI;
  return TRIAGE_BAND.NOISE;
}

/** Gmail snippet of the latest message per mock thread (server: getThreadMeta lastSnippet). */
const MOCK_SNIPPETS = {
  't-1001': 'Hi, please approve the COR designation for the TRM task order by Friday so contracting can issue the mod. The signed form is attached.',
  't-1002': 'Quick check before the Q3 review: who owns the elevator data feed now that Sam moved teams? Can you confirm by Wednesday?',
  't-1003': 'Thanks for the draft. My comments on the SOW are inline; section 4.2 still needs the performance standards.',
  't-1004': 'The facilities tech survey closed with 212 responses. Summary deck attached; could you review the recommendations?',
  't-2001': 'Three open items on the cutover schedule: data freeze date, rollback owner, and the training window.',
  't-2002': 'The vendor invoice for September is 8% over the ceiling. Do we hold payment until the Core meeting?',
  't-2003': 'Work order sync failed for 14 records overnight. Retry did not clear them. Ticket NCS-2231.',
  't-3001': '6 issues changed state: NCMMS-412 Done, NCMMS-418 In Review, NCMMS-420 Blocked...',
  't-3002': 'INC0045122 has been assigned to your group. Priority 3. Short description: badge reader offline.',
  't-3003': 'Your script Day Planner has recently failed to finish successfully. A summary of the failures is shown below.',
  't-3004': 'Unit 3 at 1800 F St is out of service as of 07:40. Estimated return: tomorrow noon.',
  't-4001': 'This week: OMB AI guidance, agency cloud budgets, and a look at modernization funding.',
  't-4002': 'Starting Monday the C-level garage requires the new permit. Old hang tags expire Oct 31.',
  't-4003': 'Your monthly usage report for September is ready. No action is needed.'
};

/** Server shape of one triage item (see HubController.getTriageBoard); ledger fields are filled at read time. */
function thread(id, subject, from, ageMin, score, signals, labels, suggestions) {
  return {
    threadId: id,
    url: GMAIL_BASE + id,
    subject,
    snippet: MOCK_SNIPPETS[id] || '',
    fromName: from,
    date: localIso(-ageMin),
    labels,
    score,
    band: bandFor(score),
    signals,
    suggestions,
    requireConfirmation: suggestions.length > 1,
    humanReviewOnly: false,
    errorMessage: null
  };
}

const QUEUE_DISPLAY = {
  directAction: 'Direct Action',
  meetingCarryIns: 'Meeting Carry-ins',
  systemExceptions: 'System Exceptions',
  fyiReading: 'FYI/Reading'
};

const SERIES_NAMES = { NCMMS_CORE: 'NCMMS Core Weekly', NCMMS_DAILY: 'NCMMS Daily', NCMMS_ACQ: 'NCMMS Acquisition', TRM_PM: 'TRM Project Management' };

/**
 * Three upcoming occurrences for a series, in the server upcoming[] shape.
 * @param {string} seriesKey Series key.
 * @returns {Array<object>} Occurrences.
 */
function mockOccurrences(seriesKey) {
  return [26, 7 * 24 + 26, 14 * 24 + 26].map((hours, i) => {
    const start = localIso(hours * 60);
    return {
      occurrenceId: `${seriesKey}-occ-${i + 1}`,
      start,
      end: localIso(hours * 60 + 30),
      cutoffISO: localIso(hours * 60 - 8 * 60),
      date: start.slice(0, 10),
      summary: SERIES_NAMES[seriesKey] || seriesKey
    };
  });
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

/** Existing carry-ins already in the notes Doc; the real server returns only their count. */
function buildCarryIns() {
  return ['t-2001', 't-2002', 't-1003'].map((id) => ({ threadId: id }));
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
    this.dryRun = opts.dryRun === true;
    this.flags = {
      ...DEFAULT_FEATURES,
      GMAIL_ROUTER: true,
      TRIAGE_BOARD: true,
      NCMMS_CORE_PILOT: true,
      ...(opts.flags || {}),
      DRY_RUN: this.dryRun
    };
    this.queues = buildThreads();
    Object.keys(this.queues).forEach((k) => this.queues[k].forEach((t) => { t.queue = QUEUE_DISPLAY[k]; }));
    this.ledger = new Map();
    this.threadOps = new Map();
    this.tasks = [];
    this.waiting = [];
    this.dismissed = new Set();
    this.carryIns = buildCarryIns();
    this.failNext = new Set();
    this.sheetProvisioned = opts.sheetProvisioned === undefined ? true : opts.sheetProvisioned;
    // true: the owner has not approved the current scopes; getHubStatus returns AUTH_REQUIRED until approveAuth().
    this.authRequired = opts.authRequired === true;
    this.lastRun = { at: localIso(-7), status: this.dryRun ? 'DRY_RUN' : 'OK', counts: { processed: 2, skipped: 0, errors: 0, quarantined: 0 } };
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
    return { ok, status: ok ? 'DONE' : 'ERROR', message, ...extra };
  }

  _fail(errorCode, message, extra = {}) {
    return { ok: false, status: 'ERROR', errorCode, message, ...extra };
  }

  /** @returns {object|null} FLAG_OFF failure when any needed flag is off (server preflight parity). */
  _preflight(needed, opts) {
    const off = needed.find((f) => this.flags[f] !== true);
    if (off) return this._fail('FLAG_OFF', `${off} flag is off`);
    const expect = opts && typeof opts === 'object' ? opts.expectDryRun : undefined;
    if (typeof expect === 'boolean' && expect !== this.dryRun) {
      return this._fail('MODE_CHANGED', 'Trial mode changed since this page loaded. Refresh before acting.');
    }
    return null;
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
  _apply(threadId, key, sideEffect, doneMsg, dryMsg, opts) {
    const gate = this._preflight(['GMAIL_ROUTER'], opts);
    if (gate) return gate;
    const src = this._find(threadId);
    if (!src) return this._fail('NOT_FOUND', 'Thread not found in current triage set');
    const existing = this.ledger.get(key);
    const sourceUrl = src.url;
    if (existing && existing.status === 'DONE') {
      return { ok: true, status: 'SKIPPED', message: 'Already processed', operationKey: key, sourceUrl, targetUrl: existing.targetUrl };
    }
    if (this.failNext.delete(key)) {
      this.ledger.set(key, { status: 'ERROR', threadId });
      this.threadOps.set(threadId, { status: 'ERROR', operationKey: key });
      return this._fail('MOCK_FAILURE', 'Simulated failure', { operationKey: key, sourceUrl });
    }
    if (this.dryRun) {
      this.ledger.set(key, { status: 'DRY_RUN', threadId });
      this.threadOps.set(threadId, { status: 'DRY_RUN', operationKey: key });
      return { ok: true, status: 'DRY_RUN', message: dryMsg, operationKey: key, sourceUrl };
    }
    const targetUrl = sideEffect();
    this.ledger.set(key, { status: 'DONE', threadId, targetUrl });
    this.threadOps.set(threadId, { status: 'DONE', operationKey: key });
    return { ok: true, status: 'DONE', message: doneMsg, operationKey: key, sourceUrl, targetUrl };
  }

  /**
   * @returns {{ok: boolean, status: string, message: string, provisioned: boolean, url: (string|null), missing: (string|null)}}
   *   Hub Sheet link (never provisions). sheetProvisioned may be true, false ('never') or 'trashed'/'deleted'.
   */
  getHubSheetLink() {
    if (this.sheetProvisioned === true) {
      return { ok: true, status: 'OK', message: 'Hub Sheet found', provisioned: true, url: 'https://docs.google.com/spreadsheets/d/mock-hub-sheet/edit#gid=0', missing: null };
    }
    const missing = this.sheetProvisioned || 'never';
    return { ok: true, status: 'OK', message: missing === 'never' ? 'Hub Sheet is not set up yet' : `Hub Sheet was ${missing}`, provisioned: false, url: null, missing };
  }

  /** @returns {object} Same shape as getHubSheetLink, after creating (or re-creating) the mock Sheet. */
  setupHub() {
    this.sheetProvisioned = true;
    return { ...this.getHubSheetLink(), message: 'Hub Sheet is ready' };
  }

  /** Test hook: the user approved the scopes on the consent page. */
  approveAuth() { this.authRequired = false; }

  getHubStatus() {
    if (this.authRequired) {
      return { ok: false, status: 'AUTH_REQUIRED', message: 'Day Planner needs your approval for new Google permissions', authUrl: 'https://example.invalid/authorize' };
    }
    const counts = {};
    this.ledger.forEach((row) => { counts[row.status] = (counts[row.status] || 0) + 1; });
    return {
      ok: true,
      status: 'OK',
      message: 'Hub status',
      flags: { ...this.flags },
      dryRun: this.dryRun,
      lastRun: { ...this.lastRun, counts: { ...this.lastRun.counts } },
      counts,
      triggers: 1
    };
  }

  getTriageBoard(filters = {}) {
    const gate = this._preflight(['GMAIL_ROUTER', 'TRIAGE_BOARD']);
    if (gate) return gate;
    const text = (filters && filters.text ? String(filters.text) : '').trim().toLowerCase();
    const queues = {};
    let total = 0;
    Object.keys(this.queues).forEach((key) => {
      queues[key] = this.queues[key]
        .filter((t) => !this.dismissed.has(t.threadId))
        .filter((t) => !text || t.subject.toLowerCase().includes(text) || t.fromName.toLowerCase().includes(text))
        .map((t) => {
          const op = this.threadOps.get(t.threadId) || {};
          return {
            ...t,
            signals: [...t.signals],
            labels: [...t.labels],
            suggestions: t.suggestions.map((d) => ({ ...d })),
            ledgerStatus: op.status || null,
            operationKey: op.operationKey || null,
            errorMessage: op.status === 'ERROR' ? 'Simulated failure' : null
          };
        });
      total += queues[key].length;
    });
    return { ok: true, status: 'OK', message: `${total} thread(s) triaged`, queues, errors: 0, dryRun: this.dryRun };
  }

  getUpcomingMeetingChoices(threadId) {
    const gate = this._preflight(['GMAIL_ROUTER']);
    if (gate) return gate;
    const src = this._find(threadId);
    if (!src) return this._fail('THREAD_NOT_FOUND', 'Gmail thread not found');
    const choices = src.suggestions.map((s) => {
      const upcoming = mockOccurrences(s.seriesKey);
      return {
        seriesKey: s.seriesKey,
        displayName: SERIES_NAMES[s.seriesKey] || s.seriesKey,
        reason: s.reason,
        upcoming,
        recommended: { occurrenceId: upcoming[0].occurrenceId, cutoffISO: upcoming[0].cutoffISO, reason: 'Next occurrence before cutoff', deferred: false }
      };
    });
    return {
      ok: true,
      status: 'OK',
      message: `${choices.length} destination(s) suggested`,
      sourceUrl: src.url,
      choices,
      requireConfirmation: src.requireConfirmation,
      humanReviewOnly: src.humanReviewOnly,
      overrides: ['current', 'recommended', 'specific', 'backlog']
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
    }, today ? 'Task created for today' : 'Task created', 'Would create Task', opts);
  }

  routeThreadToWaiting(threadId, opts = {}) {
    const key = gmailWaitingKey(threadId);
    const src = this._find(threadId);
    return this._apply(threadId, key, () => {
      const id = `mock-wait-${this.waiting.length + 1}`;
      this.waiting.push({ id, key, threadId, title: `[Waiting] ${src.subject}`, waitingOn: (opts && opts.waitingOn) || '', nagDate: (opts && opts.nagDate) || null });
      return 'https:' + '/' + '/tasks.google.com/mock/' + id;
    }, 'Waiting item created', 'Would create Task', opts);
  }

  /**
   * Mirrors the server contract: options.seriesKey is required, occurrenceId is a calendar event id
   * (or the series key when options.backlog is true).
   */
  routeThreadToMeeting(threadId, occurrenceId, opts = {}) {
    const o = opts || {};
    if (o.backlog !== true && (typeof o.seriesKey !== 'string' || !o.seriesKey)) {
      return this._fail('INVALID_INPUT', 'options.seriesKey is required');
    }
    if (!occurrenceId || String(occurrenceId).includes('|')) {
      return this._fail('INVALID_INPUT', 'Invalid occurrence id');
    }
    const key = gmailMeetingKey(threadId, o.backlog === true ? `BACKLOG-${occurrenceId}` : occurrenceId);
    return this._apply(threadId, key, () => {
      this.carryIns.push({ threadId });
      return DOCS_BASE + 'mock-notes-doc/edit';
    }, 'Carry-in appended to meeting notes', 'Would append carry-in to Doc mock...', o);
  }

  dismissTriageItem(threadId, opts) {
    const gate = this._preflight(['GMAIL_ROUTER'], opts);
    if (gate) return gate;
    const src = this._find(threadId);
    if (!src) return this._fail('THREAD_NOT_FOUND', 'Gmail thread not found');
    const operationKey = `GMAIL|${threadId}|DISMISS`;
    if (this.dryRun) return { ok: true, status: 'DRY_RUN', message: 'Would dismiss from triage', operationKey };
    this.dismissed.add(threadId);
    return { ok: true, status: 'DONE', message: 'Dismissed from triage', operationKey, sourceUrl: src.url };
  }

  /** Triage [Archive] / [Delete]: same gate and result shape as the server; the thread leaves the board. */
  _gmailWrite(threadId, done, would, opts) {
    const gate = this._preflight(['GMAIL_ROUTER'], opts);
    if (gate) return gate;
    const src = this._find(threadId);
    if (!src) return this._fail('THREAD_NOT_FOUND', 'Gmail thread not found');
    const operationKey = `GMAIL|${threadId}|DISMISS`;
    if (this.dryRun) return { ok: true, status: 'DRY_RUN', message: would, operationKey };
    this.dismissed.add(threadId);
    return { ok: true, status: 'DONE', message: done, operationKey, sourceUrl: src.url };
  }

  archiveTriageThread(threadId, opts) { return this._gmailWrite(threadId, 'Archived in Gmail', 'Would archive in Gmail', opts); }

  trashTriageThread(threadId, opts) { return this._gmailWrite(threadId, 'Moved to Gmail Trash', 'Would move to Gmail Trash', opts); }

  /** Mirrors HubController hubSetFeature: one flag, real boolean, returns the fresh flags. */
  hubSetFeature(name, value) {
    if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(DEFAULT_FEATURES, name)) return this._fail('INVALID_INPUT', 'Unknown feature flag');
    if (typeof value !== 'boolean') return this._fail('INVALID_INPUT', 'Feature flag value must be true or false');
    this.flags[name] = value;
    if (name === 'DRY_RUN') this.dryRun = value;
    return { ok: true, status: 'OK', message: `${name} set to ${value ? 'TRUE' : 'FALSE'}`, flags: { ...this.flags }, dryRun: this.dryRun };
  }

  retryFailedOperation(operationKey, opts) {
    const gate = this._preflight(['GMAIL_ROUTER'], opts);
    if (gate) return gate;
    const row = this.ledger.get(operationKey);
    if (!row) return this._fail('NOT_FOUND', 'No ledger row for that operation');
    if (row.status !== 'ERROR') return this._fail('NOT_RETRYABLE', 'Operation is not in ERROR status');
    this.ledger.delete(operationKey);
    row.status = 'DONE';
    this.ledger.set(operationKey, row);
    this.threadOps.set(row.threadId, { status: 'DONE', operationKey });
    return { ok: true, status: 'DONE', message: 'Retry succeeded', operationKey, sourceUrl: (this._find(row.threadId) || {}).url };
  }

  getMeetingPrep(seriesKey, occurrenceId) {
    const gate = this._preflight(['GMAIL_ROUTER', 'NCMMS_CORE_PILOT']);
    if (gate) return gate;
    const key = seriesKey || 'NCMMS_CORE';
    const upcoming = mockOccurrences(key);
    const hit = upcoming.find((o) => o.occurrenceId === occurrenceId) || upcoming[0];
    return {
      ok: true,
      status: 'OK',
      message: `${SERIES_NAMES[key] || key} on ${hit.date}`,
      series: { seriesKey: key, displayName: SERIES_NAMES[key] || key, prepMinutes: 30 },
      occurrence: {
        occurrenceId: hit.occurrenceId,
        start: hit.start,
        end: hit.end,
        date: hit.date,
        cutoffISO: hit.cutoffISO,
        reason: 'Next occurrence before cutoff',
        deferred: false,
        htmlLink: null
      },
      upcoming,
      carryInCount: this.carryIns.length,
      notesDocUrl: DOCS_BASE + 'mock-notes-doc/edit',
      warning: null
    };
  }
}
