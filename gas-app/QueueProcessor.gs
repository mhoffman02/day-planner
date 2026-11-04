/**
 * @file QueueProcessor.gs
 * @description Workflow queue for the Gmail/Meeting hub (Phase 28). Reads threads carrying the
 * user-applied workflow labels (the queue never writes Gmail and nothing removes those labels; Triage
 * Archive removes only INBOX, so the queue
 * is drained by ledger status, not by label state), and performs each operation exactly once:
 *   - the script lock is held by THIS file for a whole operation (the ledger/notes repositories and
 *     every Config function except the one-time DPConfig.ensureSetup take no locks; ensureSetup uses
 *     its own separate user lock, so it cannot deadlock a script-locked caller);
 *     DPEngines.runOperation gets a no-op lock adapter because the real lock is held;
 *   - every operation is claimed in the ledger first (PENDING), keyed by source + action + target,
 *     and Task creation also embeds the key in the Task notes so a crash between Task create and the
 *     ledger DONE write cannot duplicate (TaskRepository.findExistingByOpKey);
 *   - batches are bounded (BatchSize) and resumable WITHOUT a cursor: DONE rows are filtered out of
 *     the candidate list, so each run simply takes the next unprocessed items. Each item is
 *     quarantined independently (a failure becomes a sanitized ERROR ledger row; the rest proceed);
 *   - ERROR rows are re-run by the trigger loop only when DPEngines.retryDecision allows it:
 *     permanent errors (SERIES_NOT_FOUND, OCCURRENCE_NOT_FOUND, SOURCE_MISSING, retryable:false)
 *     never, retryable ones with exponential backoff and at most 5 attempts; the manual
 *     retryFailedOperation RPC always re-runs;
 *   - quota: one Sheets read of the ledger per run (DPLedgerRepo session, write-through) and one
 *     Tasks list read per run (DPTaskRepo run cache); no new item starts after 4 minutes of
 *     elapsed time, unstarted items stay untouched and the lock is released normally. Archived threads
 *     with a 🎯/ label are listed on purpose (label-and-archive is a normal way to file work); DRY_RUN
 *     writes no DONE rows, so a scheduled dry tick whose inputs match the last full dry pass (thread
 *     historyIds, flags, settings, registry; at most 1 h old) re-reports it without per-thread reads.
 * All flags default OFF, so with the flags off processWorkflowQueue is a no-op that touches no
 * Google service. DRY_RUN performs no Tasks/Docs/Ledger writes and returns the spec strings; its
 * only side effect is the HUB_LAST_RUN_DRY property (never HUB_LAST_RUN).
 *
 * IIFE per .agents/rules/gas-namespace-iife.md. Exports: DPQueue (cross-file) and the
 * processWorkflowQueue RPC alias (needs the matching top-level delegator in Code.gs).
 * Literal-only top level per .agents/rules/gas-global-init-order.md; every cross-file global
 * (DPEngines, DPConfig, DPLedgerRepo, DPNotesRepo, the repos) is read lazily inside functions.
 */
(function(global) {

const QUEUE_LAST_RUN_PROP_ = 'HUB_LAST_RUN';
const QUEUE_LAST_RUN_DRY_PROP_ = 'HUB_LAST_RUN_DRY';
const QUEUE_DRY_FP_PROP_ = 'HUB_DRY_PASS_FP';   // {fp, at} of the last full dry pass (scheduled ticks reuse it)
const QUEUE_HISTORY_WM_PROP_ = 'HUB_HISTORY_WM'; // mailbox historyId at the last clean full scan (label-added watermark)
const QUEUE_MAX_RUN_MS_ = 4 * 60 * 1000;
const QUEUE_LOCK_WAIT_MS_ = 500;
const QUEUE_PAGE_SIZE_ = 100;
const QUEUE_MAX_PAGES_ = 3;
const QUEUE_MAX_MESSAGES_ = 50;
const QUEUE_NAG_DAYS_ = 7;
const QUEUE_DEFAULT_KIND_ = 'Decision/Input needed';
const QUEUE_CORE_SERIES_ = 'NCMMS_CORE';

/**
 * @param {string} message Setup problem.
 * @returns {object} Failed result.
 */
function setupResult_(message) {
  return DPEngines.makeResult({ ok: false, status: 'ERROR', errorCode: 'SETUP_ERROR', message: DPEngines.sanitizeError(message) });
}

/**
 * @returns {string|null} Name of a missing cross-file dependency, else null.
 */
function missingDependency_() {
  const names = ['DPEngines', 'DPConfig', 'DPLedgerRepo', 'DPNotesRepo', 'DPGmailRepo', 'DPCalendarRepo', 'DPTaskRepo'];
  for (let i = 0; i < names.length; i++) {
    if (typeof global[names[i]] === 'undefined') return names[i];
  }
  return null;
}

/**
 * console.errors the sanitized message plus the stack frames (never bodies, addresses or long ids:
 * the V8 stack header, which repeats the raw message, is dropped by DPEngines.stackFrames).
 * @param {string} context Operation context.
 * @param {*} err Error or message.
 */
function logSafe_(context, err) {
  console.error(DPEngines.formatSafeError(context, err));
}

/**
 * @param {{fresh?:boolean}} [opts] fresh re-reads the Config tab when the Sheet already exists.
 * @returns {object} Frozen feature flags (UserProperties-backed; no Sheet is created by this call).
 */
function getFeatures(opts) {
  return DPConfig.getFeatures(opts);
}

/**
 * @returns {{timeZone:string,batchSize:number,triggerMinutes:number,maxExcerpt:number,tasksListId:string}} Hub settings.
 * @throws {Error} SETUP_ERROR from DPConfig when mandatory values are missing.
 */
function getSettings() {
  const cfg = DPConfig.getConfig();
  return {
    timeZone: cfg.TimeZone,
    batchSize: cfg.BatchSize,
    triggerMinutes: cfg.TriggerMinutes,
    maxExcerpt: cfg.MaxExcerptChars,
    tasksListId: cfg.TasksListId,
    lookbackDays: cfg.LookbackDays
  };
}

/**
 * Runs fn while holding the script lock.
 * @param {number} waitMs Max wait for the lock.
 * @param {function(): *} fn Work.
 * @returns {{locked:boolean, value:*}} locked false when another run holds the lock.
 */
function withLock(waitMs, fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs)) return { locked: false, value: null };
  try {
    return { locked: true, value: fn() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * @returns {{get:function(string):*, put:function(object):*}} Ledger store port for DPEngines.
 */
function ledgerStore() {
  return {
    get: function(k) { return DPLedgerRepo.get(k); },
    put: function(r) { return DPLedgerRepo.upsert(r); }
  };
}

/**
 * @param {string} ymd Local date YYYY-MM-DD.
 * @param {number} n Days to add.
 * @returns {string} Shifted date (pure y/m/d arithmetic).
 */
function addDays_(ymd, n) {
  const p = ymd.split('-');
  const d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
  const pad = function(x) { return (x < 10 ? '0' : '') + x; };
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

/**
 * @param {string} docId Doc id.
 * @returns {string} Doc URL.
 */
function docUrl_(docId) {
  return 'https://docs.google.com/document/d/' + docId + '/edit';
}

const ROUTE_ACTIONS_ = { TASK: 'CREATE_TASK', TASK_TODAY: 'CREATE_TASK', DECISION: 'CREATE_TASK', WAITING: 'CREATE_WAITING', MEETING: 'ROUTE_MEETING' };

/**
 * Best-effort PENDING to ERROR so the failure is recorded (attempt counter, backoff or permanent
 * flag) instead of waiting out the stale window. A failure before the claim (for example
 * SERIES_NOT_FOUND) has no row yet, so one is created, otherwise the trigger loop would retry it forever.
 * @param {string} opKey Operation key.
 * @param {*} err Cause.
 * @param {object} [spec] Route spec (used to create the row for a pre-claim failure).
 */
function markError_(opKey, err, spec) {
  try {
    const E = DPEngines;
    const store = ledgerStore();
    const row = store.get(opKey);
    if (row && row.Status === E.LEDGER_STATUS.PENDING) {
      store.put(E.failOp(row, new Date(), err));
    } else if (!row && spec && !spec.dryRun && spec.threadId && ROUTE_ACTIONS_[spec.kind]) {
      const now = new Date();
      // A MEETING row always records its series so a later retry never has to guess it.
      const meta = spec.kind === 'MEETING' && typeof spec.seriesKey === 'string' && spec.seriesKey ? { seriesKey: spec.seriesKey } : undefined;
      store.put(E.failOp(E.beginOp({ opKey: opKey, sourceType: 'GMAIL', sourceId: spec.threadId, action: ROUTE_ACTIONS_[spec.kind], targetType: spec.kind === 'MEETING' ? 'CARRY_IN' : 'TASK', metadata: meta }, now), now, err));
    }
  } catch (secondary) {
    logSafe_('markError_ could not persist ERROR (row stays PENDING and goes stale)', secondary);
  }
}

/**
 * Resolves the series and target occurrence of a meeting route (read-only Calendar).
 * @param {object} spec Route spec.
 * @param {Date} now Current instant.
 * @returns {{series:object,occurrenceId:(string|null),start:(string|null),deferred:boolean,backlog:boolean,reason:string}} Target.
 */
function resolveMeetingTarget_(spec, now) {
  const registry = spec.registry || DPConfig.getRegistry();
  const series = registry.filter(function(r) { return r.SeriesKey === spec.seriesKey && r.Enabled !== false; })[0];
  if (!series) {
    const nf = new Error('Meeting series is not configured or not enabled');
    nf.code = 'SERIES_NOT_FOUND';
    nf.retryable = false;
    throw nf;
  }
  if (spec.occurrenceInfo) {
    return { series: series, occurrenceId: spec.occurrenceInfo.id, start: spec.occurrenceInfo.start, deferred: !!spec.occurrenceInfo.deferred, backlog: false, reason: spec.occurrenceInfo.reason || '' };
  }
  if (spec.occurrenceId) {
    const evt = DPCalendarRepo.getOccurrence(series, spec.occurrenceId, registry);
    return { series: series, occurrenceId: evt.id, start: evt.start, deferred: false, backlog: false, reason: 'explicit occurrence' };
  }
  const occs = DPCalendarRepo.listOccurrences(series, registry, now);
  const sel = DPEngines.selectOccurrence({ occurrences: occs, series: series, now: now, timeZone: spec.settings.timeZone, override: spec.override });
  if (sel.backlog) return { series: series, occurrenceId: null, start: null, deferred: false, backlog: true, reason: sel.reason };
  const hit = occs.filter(function(o) { return o.id === sel.occurrenceId; })[0];
  return { series: series, occurrenceId: sel.occurrenceId, start: hit ? hit.start : null, deferred: !!sel.deferred, backlog: false, reason: sel.reason };
}

/**
 * Executes ONE route operation. The caller MUST hold the script lock. Never throws: every failure is
 * returned as {ok:false} (and recorded as a sanitized ERROR ledger row once the op was claimed).
 * @param {{kind:string, threadId:string, thread?:object, seriesKey?:string, occurrenceId?:string,
 *   occurrenceInfo?:object, override?:object, options?:object, dryRun:boolean, settings:object,
 *   registry?:Array<object>, opKey?:string}} spec kind is TASK, TASK_TODAY, DECISION, WAITING or MEETING.
 * @returns {object} DPEngines.makeResult-shaped result.
 */
function executeRoute(spec) {
  const E = DPEngines;
  let opKey = spec.opKey || null;
  try {
    const now = new Date();
    const o = spec.options || {};
    const thread = spec.thread || DPGmailRepo.getThreadMeta(spec.threadId, null);
    const store = ledgerStore();
    let op;
    let target = null;
    const nolock = { tryLock: function() { return true; }, releaseLock: function() {} };
    let work;
    const today = E.taskPlannerLocalDate(now, spec.settings.timeZone);

    if (spec.kind === 'TASK' || spec.kind === 'TASK_TODAY') {
      const isToday = spec.kind === 'TASK_TODAY';
      opKey = opKey || E.gmailTaskKey(spec.threadId, isToday);
      op = { opKey: opKey, sourceType: 'GMAIL', sourceId: spec.threadId, sourceVersion: thread.lastMessageId, action: 'CREATE_TASK', targetType: 'TASK' };
      work = function() {
        const out = DPTaskRepo.createFromThread({ thread: thread, today: isToday, priority: o.priority, opKey: opKey, now: now, timeZone: spec.settings.timeZone, listId: spec.settings.tasksListId });
        return { targetId: out.task.id, targetType: 'TASK', metadata: { created: out.created, due: out.task.due || '' } };
      };
    } else if (spec.kind === 'DECISION') {
      opKey = opKey || E.gmailDecisionKey(spec.threadId);
      op = { opKey: opKey, sourceType: 'GMAIL', sourceId: spec.threadId, sourceVersion: thread.lastMessageId, action: 'CREATE_TASK', targetType: 'TASK' };
      work = function() {
        const out = DPTaskRepo.createFromThread({ thread: thread, decision: true, priority: o.priority, opKey: opKey, now: now, timeZone: spec.settings.timeZone, listId: spec.settings.tasksListId });
        return { targetId: out.task.id, targetType: 'TASK', metadata: { created: out.created, due: '' } };
      };
    } else if (spec.kind === 'WAITING') {
      opKey = opKey || E.gmailWaitingKey(spec.threadId);
      op = { opKey: opKey, sourceType: 'GMAIL', sourceId: spec.threadId, sourceVersion: thread.lastMessageId, action: 'CREATE_WAITING', targetType: 'TASK' };
      work = function() {
        const other = thread.messages.filter(function(m) { return !m.isFromUser; });
        const waitingOn = o.waitingOn || (other.length ? other[other.length - 1].fromName : '') || 'Unspecified';
        const out = DPTaskRepo.createWaiting({ thread: thread, waitingOn: waitingOn, nagDate: o.nagDate || addDays_(today, QUEUE_NAG_DAYS_), priority: o.priority, opKey: opKey, now: now, listId: spec.settings.tasksListId });
        return { targetId: out.task.id, targetType: 'TASK', metadata: { created: out.created } };
      };
    } else if (spec.kind === 'MEETING') {
      target = resolveMeetingTarget_(spec, now);
      const occKey = target.backlog ? 'BACKLOG-' + target.series.SeriesKey : target.occurrenceId;
      opKey = opKey || E.gmailMeetingKey(spec.threadId, occKey);
      op = { opKey: opKey, sourceType: 'GMAIL', sourceId: spec.threadId, sourceVersion: thread.lastMessageId, action: 'ROUTE_MEETING', targetType: target.backlog ? 'BACKLOG' : 'CARRY_IN',
        kind: 'MEETING', occurrenceId: target.occurrenceId || occKey, metadata: { seriesKey: target.series.SeriesKey, start: target.start || '' } };
      work = function() { return carryIn_(spec, thread, target, now); };
    } else {
      throw new Error('Unknown route kind');
    }

    if (spec.dryRun) {
      const dry = E.claimOperation({ store: store, lock: nolock, clock: function() { return now; }, op: op, dryRun: true });
      let messages = dry.messages.slice();
      if (target && target.deferred) messages.push(E.dryRunMessage('DEFER_CUTOFF'));
      if (target && target.backlog) messages = ['Would park in series backlog'];
      return E.makeResult({ ok: true, operationKey: opKey, status: 'DRY_RUN', sourceUrl: thread.url, message: messages.join('; ') || dry.reason, messages: messages, deferred: !!(target && target.deferred) });
    }

    const r = E.runOperation({ store: store, lock: nolock, clock: function() { return new Date(); }, op: op, work: work });
    return mapOutcome_(r, opKey, thread, target, spec.settings.timeZone);
  } catch (err) {
    if (opKey) markError_(opKey, err, spec);
    logSafe_('executeRoute ' + spec.kind, err);
    return E.makeResult({ ok: false, operationKey: opKey || undefined, status: 'ERROR', errorCode: (err && err.code) ? E.sanitizeError(String(err.code), 40) : 'ERROR', message: E.sanitizeError(err), retryable: !(err && err.retryable === false) });
  }
}

/**
 * Records the pointer-only carry-in as the ledger row metadata (idempotent via the ledger operation key).
 * No Google Doc is read or written: drive.file refuses writes to a user-owned notes Doc, so Meeting Prep
 * lists these rows. completeOp REPLACES MetadataJson with this metadata, so seriesKey and start are re-included.
 * @param {object} spec Route spec.
 * @param {object} thread Thread meta.
 * @param {object} target Resolved meeting target.
 * @param {Date} now Current instant.
 * @returns {{targetId:string,targetType:string,metadata:object}} Work result.
 */
function carryIn_(spec, thread, target, now) {
  const E = DPEngines;
  const o = spec.options || {};
  if (target.backlog) return { targetId: 'BACKLOG-' + target.series.SeriesKey, targetType: 'BACKLOG', metadata: { backlog: true, seriesKey: target.series.SeriesKey } };
  const tz = spec.settings.timeZone;
  const other = thread.messages.filter(function(m) { return !m.isFromUser; });
  const last = other.length ? other[other.length - 1] : thread.messages[thread.messages.length - 1];
  void now;
  return {
    targetId: target.occurrenceId,
    targetType: 'CARRY_IN',
    metadata: {
      seriesKey: target.series.SeriesKey,
      start: target.start || '',
      occurrenceId: target.occurrenceId,
      subject: thread.subject,
      fromName: last ? last.fromName : '',
      receivedDate: last && last.date ? E.taskPlannerLocalDate(new Date(Date.parse(last.date)), tz) : '',
      gmailUrl: thread.url,
      snippet: last && last.snippet ? String(last.snippet).slice(0, spec.settings.maxExcerpt) : '',
      kind: o.kind || QUEUE_DEFAULT_KIND_,
      framing: o.framing || ''
    }
  };
}

/**
 * @param {object} r Result of DPEngines.runOperation.
 * @param {string} opKey Operation key.
 * @param {object} thread Thread meta.
 * @param {object|null} target Meeting target.
 * @returns {object} makeResult-shaped result.
 */
function mapOutcome_(r, opKey, thread, target, tz) {
  const E = DPEngines;
  const base = { operationKey: opKey, sourceUrl: thread.url };
  if (r.action === 'SKIP_DONE') {
    const row = r.row || {};
    return E.makeResult(Object.assign(base, { ok: true, status: 'SKIPPED', message: 'Already processed', targetUrl: targetUrlOf_(row.TargetType, row.TargetId) }));
  }
  if (r.action === 'WAIT_IN_FLIGHT') {
    return E.makeResult(Object.assign(base, { ok: true, status: 'IN_FLIGHT', message: r.reason || 'Operation in flight' }));
  }
  if (r.action === 'ERROR' || !r.ok) {
    return E.makeResult(Object.assign(base, { ok: false, status: 'ERROR', errorCode: r.errorCode || 'ERROR', message: r.reason || 'Operation failed', retryable: r.retryable !== false }));
  }
  const done = r.row || {};
  const message = target && !target.backlog
    ? 'Added to ' + target.series.DisplayName + ' on ' + E.taskPlannerLocalDate(new Date(Date.parse(target.start)), tz)
    : (done.TargetType === 'BACKLOG' ? 'Parked in series backlog' : 'Task created');
  return E.makeResult(Object.assign(base, { ok: true, status: 'DONE', message: message, targetUrl: targetUrlOf_(done.TargetType, done.TargetId), deferred: !!(target && target.deferred) }));
}

/**
 * @param {string} type Ledger TargetType.
 * @param {string} id Ledger TargetId.
 * @returns {string|undefined} Link to the target.
 */
function targetUrlOf_(type, id) {
  if (type === 'DOC' && id) return docUrl_(id);
  if (type === 'TASK' && id) return DPTaskRepo.taskUrl(null);
  return undefined;
}

/**
 * Collects candidate items (deduplicated; DONE operations filtered out so the queue drains even
 * though labels are never removed).
 * @param {object} ctx {features, settings, registry, doneKeys, blockedKeys, ledgerRows, meetingDoneThreads, errors}.
 * @returns {Array<object>} Items {opKey, threadId, kind, action, ...}.
 */
function collectItems_(ctx) {
  const E = DPEngines;
  const W = E.WORKFLOW_LABEL;
  const items = [];
  const seen = {};
  const todayThreads = {};

  // Threads with an unfinished ledger row per kind (ERROR / PENDING / DEFERRED). The watermark would otherwise
  // drop them: a retryable ERROR in backoff is filtered out of the run, so the run ends clean and the
  // watermark moves on, and nothing would re-collect the thread when the backoff elapses.
  const openByKind = {};
  (ctx.ledgerRows || []).forEach(function(r) {
    if (r.Status === E.LEDGER_STATUS.DONE || r.Status === E.LEDGER_STATUS.SKIPPED) return;
    const m = /^GMAIL\|([^|]+)\|(TASK_TODAY|TASK|WAITING|DECISION|MEETING)(\||$)/.exec(r.OperationKey);
    if (m) (openByKind[m[2]] = openByKind[m[2]] || []).push(m[1]);
  });
  function withOpen(ids, kind) {
    const seenIds = {};
    return ids.concat(openByKind[kind] || []).filter(function(tid) { return seenIds[tid] ? false : (seenIds[tid] = true); });
  }

  function pagedThreadIds(label, kind) {
    // Watermark: only threads that gained the label since the last clean scan (archived ones included).
    // Expired history (about a week) or no watermark yet: bounded lookback on the last message date.
    if (ctx.scan && ctx.scan.startHistoryId) {
      const since = DPGmailRepo.listThreadsLabeledSince(label, ctx.scan.startHistoryId);
      if (!since.expired) return withOpen(since.threadIds, kind);
      ctx.scan.fellBack = true;
    }
    let ids = [];
    let pageToken = null;
    let pages = 0;
    do {
      const page = DPGmailRepo.listThreadsByLabel(label, { maxResults: QUEUE_PAGE_SIZE_, pageToken: pageToken, newerThanDays: ctx.settings.lookbackDays });
      ids = ids.concat(page.threadIds);
      Object.keys(page.historyIds || {}).forEach(function(tid) { ctx.historyIds[tid] = page.historyIds[tid]; });
      pageToken = page.nextPageToken;
      pages += 1;
    } while (pageToken && pages < QUEUE_MAX_PAGES_);
    return withOpen(ids, kind);
  }
  function push(item) {
    if (seen[item.opKey] || ctx.doneKeys[item.opKey] || ctx.blockedKeys[item.opKey]) return;
    seen[item.opKey] = true;
    items.push(item);
  }

  // A thread labelled Decision is a pending decision; any Task/Task-Today label on it is not a second Task.
  const decisionThreads = {};
  pagedThreadIds(W.DECISION, 'DECISION').forEach(function(tid) {
    decisionThreads[tid] = true;
    push({ opKey: E.gmailDecisionKey(tid), threadId: tid, kind: 'DECISION', action: 'CREATE_TASK' });
  });
  pagedThreadIds(W.TASK_TODAY, 'TASK_TODAY').forEach(function(tid) {
    if (decisionThreads[tid] || ctx.doneKeys[E.gmailDecisionKey(tid)]) return;
    todayThreads[tid] = true;
    push({ opKey: E.gmailTaskKey(tid, true), threadId: tid, kind: 'TASK_TODAY', action: 'CREATE_TASK' });
  });
  pagedThreadIds(W.TASK, 'TASK').forEach(function(tid) {
    // Under the watermark the sets above hold only recently labelled threads: finished Decision/Today work also blocks a plain Task.
    if (todayThreads[tid] || decisionThreads[tid] || ctx.doneKeys[E.gmailDecisionKey(tid)] || ctx.doneKeys[E.gmailTaskKey(tid, true)]) return;
    push({ opKey: E.gmailTaskKey(tid, false), threadId: tid, kind: 'TASK', action: 'CREATE_TASK' });
  });
  pagedThreadIds(W.WAITING, 'WAITING').forEach(function(tid) {
    push({ opKey: E.gmailWaitingKey(tid), threadId: tid, kind: 'WAITING', action: 'CREATE_WAITING' });
  });

  if (ctx.features.NCMMS_CORE_PILOT === true) {
    const coreIds = pagedThreadIds(W.MEETING_NCMMS_CORE, 'MEETING').filter(function(tid) { return !ctx.meetingDoneThreads[tid]; });
    if (coreIds.length) {
      try {
        const now = new Date();
        const series = ctx.registry.filter(function(r) { return r.SeriesKey === QUEUE_CORE_SERIES_ && r.Enabled !== false; })[0];
        if (!series) throw new Error('NCMMS_CORE is not enabled in the Meeting Registry');
        const occs = DPCalendarRepo.listOccurrences(series, ctx.registry, now);
        const sel = E.selectOccurrence({ occurrences: occs, series: series, now: now, timeZone: ctx.settings.timeZone });
        const hit = occs.filter(function(x) { return x.id === sel.occurrenceId; })[0];
        coreIds.forEach(function(tid) {
          // Carry-in idempotency must not depend on the freshly selected occurrence alone: a PENDING row
          // left by a crash after the Doc write is resumed on ITS occurrence even if the cutoff has since
          // rolled over to the next one (the Doc signature then makes it a no-op that just records DONE).
          const active = E.findActiveMeetingRow(ctx.ledgerRows, { threadId: tid, seriesKey: QUEUE_CORE_SERIES_, now: now });
          if (active) {
            const occId = active.OperationKey.split('|')[3];
            // findActiveMeetingRow never returns a row with corrupt metadata; if that invariant breaks,
            // this throws and the whole selection is recorded as SELECTION_FAILED (never resumed blind).
            const meta = JSON.parse(active.MetadataJson || '{}');
            const prior = occs.filter(function(x) { return x.id === occId; })[0];
            const start = prior ? prior.start : (meta.start || null);
            if (start) {
              push({ opKey: active.OperationKey, threadId: tid, kind: 'MEETING', action: 'ROUTE_MEETING', seriesKey: QUEUE_CORE_SERIES_,
                occurrenceInfo: { id: occId, start: start, deferred: false, reason: 'resumed earlier routing' } });
              return;
            }
          }
          push({ opKey: E.gmailMeetingKey(tid, sel.occurrenceId), threadId: tid, kind: 'MEETING', action: 'ROUTE_MEETING', seriesKey: QUEUE_CORE_SERIES_,
            occurrenceInfo: { id: sel.occurrenceId, start: hit ? hit.start : null, deferred: !!sel.deferred, reason: sel.reason } });
        });
      } catch (err) {
        ctx.errors.push({ code: 'SELECTION_FAILED', message: E.sanitizeError(err) });
        logSafe_('collectItems_ core occurrence selection', err);
      }
    }
  }
  return items;
}

/**
 * Body of one locked queue run. One Sheets read (snapshot batchGet) and at most one Tasks list read per run; stops
 * starting new items after QUEUE_MAX_RUN_MS_.
 * @param {boolean} dry True for DRY_RUN.
 * @param {object} features Feature flags.
 * @param {{scheduled?:boolean}} [opts] scheduled: trigger tick, may reuse an unchanged dry result.
 * @returns {object} makeResult-shaped summary.
 */
function runLocked_(dry, features, opts) {
  const E = DPEngines;
  const startMs = Date.now();
  const store = ledgerStore();
  try {
    // ONE Sheets read for the run: Config + Registry + Ledger in a single batchGet.
    DPLedgerRepo.beginSession(DPConfig.beginSnapshot([DPLedgerRepo.readRange()])[0]);
    const settings = getSettings();
    const registry = DPConfig.getRegistry();
    DPTaskRepo.beginRun(settings.tasksListId);
    const now0 = new Date();
    const doneKeys = {};
    const blockedKeys = {};
    const meetingDoneThreads = {};
    const ledgerRows = DPLedgerRepo.list({ sourceType: 'GMAIL' });
    ledgerRows.forEach(function(r) {
      if (r.Status === E.LEDGER_STATUS.DONE) {
        doneKeys[r.OperationKey] = true;
        const m = /^GMAIL\|([^|]+)\|MEETING\|/.exec(r.OperationKey);
        if (m) meetingDoneThreads[m[1]] = true;
      } else if (r.Status === E.LEDGER_STATUS.ERROR && !E.retryDecision(r, now0).retry) {
        blockedKeys[r.OperationKey] = true; // permanent, backing off, or out of attempts: manual retry only
      }
    });
    const errors = [];
    const historyIds = {};
    // Read the mailbox historyId BEFORE listing so a label added mid-scan is seen by the next one.
    const scan = { startHistoryId: PropertiesService.getUserProperties().getProperty(QUEUE_HISTORY_WM_PROP_) || null, nextHistoryId: DPGmailRepo.currentHistoryId(), fellBack: false };
    const items = collectItems_({ scan: scan, features: features, settings: settings, registry: registry, doneKeys: doneKeys, blockedKeys: blockedKeys, ledgerRows: ledgerRows, meetingDoneThreads: meetingDoneThreads, errors: errors, historyIds: historyIds });
    let fingerprint = null;
    if (dry) {
      fingerprint = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
        E.dryPassFingerprintSource({ items: items, historyIds: historyIds, features: features, settings: settings, registry: registry }), Utilities.Charset.UTF_8));
      const skipped = reuseUnchangedDryPass_(!!(opts && opts.scheduled), fingerprint);
      if (skipped) return skipped;
    }
    const metaByThread = {};
    const plan = E.planBatch({
      items: items,
      cursor: 0,
      batchSize: settings.batchSize,
      lockHeld: true,
      flags: features,
      clock: function() { return new Date(); },
      priorRow: function(item) { return store.get(item.opKey); },
      isSourceAvailable: function(item) {
        try {
          metaByThread[item.threadId] = metaByThread[item.threadId] || DPGmailRepo.getThreadMeta(item.threadId, null);
          return true;
        } catch (err) {
          if (err && err.code === 'THREAD_NOT_FOUND') return false;
          throw err;
        }
      }
    });
    const counts = { candidates: items.length, processed: 0, skipped: 0, inFlight: 0, errors: 0, quarantined: plan.quarantined.length, deferred: 0, notStarted: 0, dryRun: dry };
    const messages = [];
    if (!dry) {
      plan.quarantined.forEach(function(q) { if (q.ledgerRow) store.put(q.ledgerRow); });
    } else {
      plan.quarantined.forEach(function(q) { messages.push('Would quarantine: ' + q.errorMessage); });
    }
    const collectErrors = errors.length; // selection failures; item failures are counted in the loop
    let timeLimited = false;
    for (let i = 0; i < plan.toProcess.length; i++) {
      if (Date.now() - startMs >= QUEUE_MAX_RUN_MS_) {
        timeLimited = true;
        counts.notStarted = plan.toProcess.length - i;
        break;
      }
      const item = plan.toProcess[i];
      const r = executeRoute({ kind: item.kind, threadId: item.threadId, thread: metaByThread[item.threadId], seriesKey: item.seriesKey, occurrenceInfo: item.occurrenceInfo,
        dryRun: dry, settings: settings, registry: registry, opKey: item.opKey });
      if (!r.ok) {
        counts.errors += 1;
        if (errors.length < QUEUE_MAX_MESSAGES_) errors.push({ operationKey: item.opKey, code: r.errorCode || 'ERROR', message: r.message });
      }
      else if (r.status === 'SKIPPED') counts.skipped += 1;
      else if (r.status === 'IN_FLIGHT') counts.inFlight += 1;
      else counts.processed += 1;
      if (r.deferred) counts.deferred += 1;
      if (messages.length < QUEUE_MAX_MESSAGES_) messages.push(r.message);
    }
    counts.errors += collectErrors;
    counts.timeLimited = timeLimited;
    DPLedgerRepo.flush(); // queued completions; throws (fail loud) before the run reports success
    const meter = DPConfig.sheetsMeter(); // since the reset at the top of runQueue
    counts.sheetsReads = meter.reads;
    counts.sheetsWrites = meter.writes;
    // Outcome in words, not just ok: FAILED = nothing succeeded, PARTIAL = some items failed.
    const succeeded = counts.processed + counts.skipped + counts.inFlight;
    const status = dry ? 'DRY_RUN' : (counts.errors === 0 ? 'DONE' : (succeeded === 0 ? 'FAILED' : 'PARTIAL'));
    const failedLead = counts.errors ? counts.errors + ' of ' + (succeeded + counts.errors) + ' items failed; ' : '';
    // DRY_RUN never touches the live HUB_LAST_RUN record, only its own clearly named property.
    const props = PropertiesService.getUserProperties();
    const at = new Date().toISOString();
    props.setProperty(dry ? QUEUE_LAST_RUN_DRY_PROP_ : QUEUE_LAST_RUN_PROP_, JSON.stringify({ at: at, status: status, counts: counts }));
    // A time-limited pass did not see every item, so it is no baseline for skipping the next tick.
    if (dry && !timeLimited) props.setProperty(QUEUE_DRY_FP_PROP_, JSON.stringify({ fp: fingerprint, at: at }));
    const done = !timeLimited && items.length <= settings.batchSize;
    // Advance the watermark only after a live run that saw and cleanly finished every candidate; otherwise the
    // unfinished ones (batch cap, time limit, failures) are re-collected from the old watermark next run.
    if (!dry && scan.nextHistoryId && done && counts.errors === 0) props.setProperty(QUEUE_HISTORY_WM_PROP_, scan.nextHistoryId);
    return E.makeResult({ ok: counts.errors === 0, status: status,
      message: failedLead + (dry ? 'Dry run: ' : '') + counts.processed + ' processed, ' + counts.skipped + ' skipped, ' + counts.errors + ' errors, ' + counts.quarantined + ' quarantined' +
        (timeLimited ? ', stopped at the ' + (QUEUE_MAX_RUN_MS_ / 60000) + ' minute time limit (' + counts.notStarted + ' not started; they resume next run)' : ''),
      counts: counts, messages: messages, errors: errors, done: done });
  } finally {
    DPTaskRepo.endRun();
    DPLedgerRepo.endSession();
    DPConfig.endSnapshot();
  }
}

/**
 * @param {string} name User property holding JSON.
 * @returns {object|null} Parsed value, or null when missing or corrupt (logged; the caller then does a full pass).
 */
function readJsonProp_(name) {
  try {
    return JSON.parse(PropertiesService.getUserProperties().getProperty(name) || 'null');
  } catch (err) {
    logSafe_('readJsonProp_ ' + name + ' is corrupt, running a full dry pass', err);
    return null;
  }
}

/**
 * Trial mode writes no DONE rows, so each tick would re-read Gmail for the same batch. When the scheduled tick's
 * inputs match the last full dry pass, re-report that pass instead of reading every thread again.
 * @param {boolean} scheduled True on the trigger tick (manual runs always do a full pass).
 * @param {string} fingerprint Digest of this tick's inputs.
 * @returns {object|null} makeResult-shaped DRY_RUN result, or null to run the full pass.
 */
function reuseUnchangedDryPass_(scheduled, fingerprint) {
  const last = readJsonProp_(QUEUE_DRY_FP_PROP_);
  const prior = readJsonProp_(QUEUE_LAST_RUN_DRY_PROP_);
  if (!prior || !DPEngines.shouldSkipDryPass({ scheduled: scheduled, dry: true, fingerprint: fingerprint, last: last, nowMs: new Date().getTime() })) return null;
  const at = new Date().toISOString();
  PropertiesService.getUserProperties().setProperty(QUEUE_LAST_RUN_DRY_PROP_,
    JSON.stringify({ at: at, status: 'DRY_RUN', counts: prior.counts, unchangedSince: last.at }));
  return DPEngines.makeResult({ ok: true, status: 'DRY_RUN', message: 'Dry run: nothing changed since ' + last.at + '; Gmail not re-read',
    counts: prior.counts, messages: [], errors: [], done: true, unchangedSince: last.at });
}

/**
 * Shared implementation for the RPC and the dispatcher.
 * @param {boolean} forceDry Only ever forces DRY_RUN on; never turns it off.
 * @param {{scheduled?:boolean}} [opts] scheduled: the trigger tick (hubDispatch).
 * @returns {object} makeResult-shaped result.
 */
function runQueue(forceDry, opts) {
  const missing = missingDependency_();
  if (missing) return typeof DPEngines === 'undefined' ? { ok: false, message: 'DPEngines is not loaded' } : setupResult_('Missing dependency ' + missing);
  try {
    DPConfig.resetSheetsMeter();
    const features = getFeatures();
    if (features.GMAIL_ROUTER !== true) {
      return DPEngines.makeResult({ ok: true, status: 'NOOP', message: 'GMAIL_ROUTER flag is off' });
    }
    const dry = !!forceDry || features.DRY_RUN === true;
    const locked = withLock(QUEUE_LOCK_WAIT_MS_, function() { return runLocked_(dry, features, opts); });
    if (!locked.locked) return DPEngines.makeResult({ ok: true, status: 'LOCK_BUSY', message: 'Another run holds the lock; skipped' });
    return locked.value;
  } catch (err) {
    logSafe_('processWorkflowQueue', err);
    return DPEngines.makeResult({ ok: false, status: 'ERROR', errorCode: (err && err.code) ? DPEngines.sanitizeError(String(err.code), 40) : 'ERROR', message: DPEngines.sanitizeError(err) });
  }
}

/**
 * RPC / trigger entry: processes one bounded, resumable slice of the workflow queue.
 * @returns {object} makeResult-shaped summary (NOOP when GMAIL_ROUTER is off).
 */
function processWorkflowQueue() {
  return runQueue(false);
}

global.DPQueue = Object.freeze({
  run: runQueue,
  executeRoute: executeRoute,
  getFeatures: getFeatures,
  getSettings: getSettings,
  withLock: withLock,
  ledgerStore: ledgerStore,
  logSafe: logSafe_,
  addDays: addDays_,
  missingDependency: missingDependency_,
  setupResult: setupResult_
});   // cross-file only: HubController.gs, Triggers.gs, UnitTests.gs

global._processWorkflowQueueInternal = processWorkflowQueue;   // google.script.run + Code.gs top-level delegator

})(typeof globalThis !== 'undefined' ? globalThis : this);
