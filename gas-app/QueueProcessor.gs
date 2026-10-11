/**
 * @file QueueProcessor.gs
 * @description Workflow queue for the Gmail/Meeting hub (Phase 28). Reads threads carrying the
 * user-applied workflow labels (Gmail is strictly read-only: labels are never removed, so the queue
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
 *     elapsed time, unstarted items stay untouched and the lock is released normally.
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

var QUEUE_LAST_RUN_PROP_ = 'HUB_LAST_RUN';
var QUEUE_LAST_RUN_DRY_PROP_ = 'HUB_LAST_RUN_DRY';
var QUEUE_MAX_RUN_MS_ = 4 * 60 * 1000;
var QUEUE_LOCK_WAIT_MS_ = 500;
var QUEUE_PAGE_SIZE_ = 100;
var QUEUE_MAX_PAGES_ = 3;
var QUEUE_MAX_MESSAGES_ = 50;
var QUEUE_NAG_DAYS_ = 7;
var QUEUE_DEFAULT_KIND_ = 'Decision/Input needed';
var QUEUE_CORE_SERIES_ = 'NCMMS_CORE';

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
  var names = ['DPEngines', 'DPConfig', 'DPLedgerRepo', 'DPNotesRepo', 'DPGmailRepo', 'DPCalendarRepo', 'DPTaskRepo'];
  for (var i = 0; i < names.length; i++) {
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
  var cfg = DPConfig.getConfig();
  return {
    timeZone: cfg.TimeZone,
    batchSize: cfg.BatchSize,
    triggerMinutes: cfg.TriggerMinutes,
    maxExcerpt: cfg.MaxExcerptChars,
    tasksListId: cfg.TasksListId
  };
}

/**
 * Runs fn while holding the script lock.
 * @param {number} waitMs Max wait for the lock.
 * @param {function(): *} fn Work.
 * @returns {{locked:boolean, value:*}} locked false when another run holds the lock.
 */
function withLock(waitMs, fn) {
  var lock = LockService.getScriptLock();
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
  var p = ymd.split('-');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
  var pad = function(x) { return (x < 10 ? '0' : '') + x; };
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

/**
 * @param {string} docId Doc id.
 * @returns {string} Doc URL.
 */
function docUrl_(docId) {
  return 'https://docs.google.com/document/d/' + docId + '/edit';
}

var ROUTE_ACTIONS_ = { TASK: 'CREATE_TASK', TASK_TODAY: 'CREATE_TASK', WAITING: 'CREATE_WAITING', MEETING: 'ROUTE_MEETING' };

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
    var E = DPEngines;
    var store = ledgerStore();
    var row = store.get(opKey);
    if (row && row.Status === E.LEDGER_STATUS.PENDING) {
      store.put(E.failOp(row, new Date(), err));
    } else if (!row && spec && !spec.dryRun && spec.threadId && ROUTE_ACTIONS_[spec.kind]) {
      var now = new Date();
      // A MEETING row always records its series so a later retry never has to guess it.
      var meta = spec.kind === 'MEETING' && typeof spec.seriesKey === 'string' && spec.seriesKey ? { seriesKey: spec.seriesKey } : undefined;
      store.put(E.failOp(E.beginOp({ opKey: opKey, sourceType: 'GMAIL', sourceId: spec.threadId, action: ROUTE_ACTIONS_[spec.kind], targetType: spec.kind === 'MEETING' ? 'DOC' : 'TASK', metadata: meta }, now), now, err));
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
  var registry = spec.registry || DPConfig.getRegistry();
  var series = registry.filter(function(r) { return r.SeriesKey === spec.seriesKey && r.Enabled !== false; })[0];
  if (!series) {
    var nf = new Error('Meeting series is not configured or not enabled');
    nf.code = 'SERIES_NOT_FOUND';
    nf.retryable = false;
    throw nf;
  }
  if (spec.occurrenceInfo) {
    return { series: series, occurrenceId: spec.occurrenceInfo.id, start: spec.occurrenceInfo.start, deferred: !!spec.occurrenceInfo.deferred, backlog: false, reason: spec.occurrenceInfo.reason || '' };
  }
  if (spec.occurrenceId) {
    var evt = DPCalendarRepo.getOccurrence(series, spec.occurrenceId, registry);
    return { series: series, occurrenceId: evt.id, start: evt.start, deferred: false, backlog: false, reason: 'explicit occurrence' };
  }
  var occs = DPCalendarRepo.listOccurrences(series, registry, now);
  var sel = DPEngines.selectOccurrence({ occurrences: occs, series: series, now: now, timeZone: spec.settings.timeZone, override: spec.override });
  if (sel.backlog) return { series: series, occurrenceId: null, start: null, deferred: false, backlog: true, reason: sel.reason };
  var hit = occs.filter(function(o) { return o.id === sel.occurrenceId; })[0];
  return { series: series, occurrenceId: sel.occurrenceId, start: hit ? hit.start : null, deferred: !!sel.deferred, backlog: false, reason: sel.reason };
}

/**
 * Executes ONE route operation. The caller MUST hold the script lock. Never throws: every failure is
 * returned as {ok:false} (and recorded as a sanitized ERROR ledger row once the op was claimed).
 * @param {{kind:string, threadId:string, thread?:object, seriesKey?:string, occurrenceId?:string,
 *   occurrenceInfo?:object, override?:object, options?:object, dryRun:boolean, settings:object,
 *   registry?:Array<object>, opKey?:string}} spec kind is TASK, TASK_TODAY, WAITING or MEETING.
 * @returns {object} DPEngines.makeResult-shaped result.
 */
function executeRoute(spec) {
  var E = DPEngines;
  var opKey = spec.opKey || null;
  try {
    var now = new Date();
    var o = spec.options || {};
    var thread = spec.thread || DPGmailRepo.getThreadMeta(spec.threadId, null);
    var store = ledgerStore();
    var op;
    var target = null;
    var nolock = { tryLock: function() { return true; }, releaseLock: function() {} };
    var work;
    var today = E.taskPlannerLocalDate(now, spec.settings.timeZone);

    if (spec.kind === 'TASK' || spec.kind === 'TASK_TODAY') {
      var isToday = spec.kind === 'TASK_TODAY';
      opKey = opKey || E.gmailTaskKey(spec.threadId, isToday);
      op = { opKey: opKey, sourceType: 'GMAIL', sourceId: spec.threadId, sourceVersion: thread.lastMessageId, action: 'CREATE_TASK', targetType: 'TASK' };
      work = function() {
        var out = DPTaskRepo.createFromThread({ thread: thread, today: isToday, priority: o.priority, opKey: opKey, now: now, timeZone: spec.settings.timeZone, listId: spec.settings.tasksListId });
        return { targetId: out.task.id, targetType: 'TASK', metadata: { created: out.created, due: out.task.due || '' } };
      };
    } else if (spec.kind === 'WAITING') {
      opKey = opKey || E.gmailWaitingKey(spec.threadId);
      op = { opKey: opKey, sourceType: 'GMAIL', sourceId: spec.threadId, sourceVersion: thread.lastMessageId, action: 'CREATE_WAITING', targetType: 'TASK' };
      work = function() {
        var other = thread.messages.filter(function(m) { return !m.isFromUser; });
        var waitingOn = o.waitingOn || (other.length ? other[other.length - 1].fromName : '') || 'Unspecified';
        var out = DPTaskRepo.createWaiting({ thread: thread, waitingOn: waitingOn, nagDate: o.nagDate || addDays_(today, QUEUE_NAG_DAYS_), priority: o.priority, opKey: opKey, now: now, listId: spec.settings.tasksListId });
        return { targetId: out.task.id, targetType: 'TASK', metadata: { created: out.created } };
      };
    } else if (spec.kind === 'MEETING') {
      target = resolveMeetingTarget_(spec, now);
      var occKey = target.backlog ? 'BACKLOG-' + target.series.SeriesKey : target.occurrenceId;
      opKey = opKey || E.gmailMeetingKey(spec.threadId, occKey);
      op = { opKey: opKey, sourceType: 'GMAIL', sourceId: spec.threadId, sourceVersion: thread.lastMessageId, action: 'ROUTE_MEETING', targetType: target.backlog ? 'BACKLOG' : 'DOC',
        kind: 'MEETING', occurrenceId: target.occurrenceId || occKey, docId: target.series.HumanNotesDocId || 'new', metadata: { seriesKey: target.series.SeriesKey, start: target.start || '' } };
      work = function() { return carryIn_(spec, thread, target, now); };
    } else {
      throw new Error('Unknown route kind');
    }

    if (spec.dryRun) {
      var dry = E.claimOperation({ store: store, lock: nolock, clock: function() { return now; }, op: op, dryRun: true });
      var messages = dry.messages.slice();
      if (target && target.deferred) messages.push(E.dryRunMessage('DEFER_CUTOFF'));
      if (target && target.backlog) messages = ['Would park in series backlog'];
      return E.makeResult({ ok: true, operationKey: opKey, status: 'DRY_RUN', sourceUrl: thread.url, message: messages.join('; ') || dry.reason, messages: messages, deferred: !!(target && target.deferred) });
    }

    var r = E.runOperation({ store: store, lock: nolock, clock: function() { return new Date(); }, op: op, work: work });
    return mapOutcome_(r, opKey, thread, target, spec.settings.timeZone);
  } catch (err) {
    if (opKey) markError_(opKey, err, spec);
    logSafe_('executeRoute ' + spec.kind, err);
    return E.makeResult({ ok: false, operationKey: opKey || undefined, status: 'ERROR', errorCode: (err && err.code) ? E.sanitizeError(String(err.code), 40) : 'ERROR', message: E.sanitizeError(err), retryable: !(err && err.retryable === false) });
  }
}

/**
 * Appends the pointer-only carry-in to the app-owned notes Doc (idempotent via signature).
 * @param {object} spec Route spec.
 * @param {object} thread Thread meta.
 * @param {object} target Resolved meeting target.
 * @param {Date} now Current instant.
 * @returns {{targetId:string,targetType:string,metadata:object}} Work result.
 */
function carryIn_(spec, thread, target, now) {
  var E = DPEngines;
  var o = spec.options || {};
  if (target.backlog) return { targetId: 'BACKLOG-' + target.series.SeriesKey, targetType: 'BACKLOG', metadata: { backlog: true, seriesKey: target.series.SeriesKey } };
  var tz = spec.settings.timeZone;
  var docId = DPNotesRepo.ensureNotesDoc(target.series.SeriesKey);
  var model = DPNotesRepo.readDocModel(docId);
  var occ = { occurrenceId: target.occurrenceId, date: E.taskPlannerLocalDate(new Date(Date.parse(target.start)), tz), displayName: target.series.DisplayName };
  var other = thread.messages.filter(function(m) { return !m.isFromUser; });
  var last = other.length ? other[other.length - 1] : thread.messages[thread.messages.length - 1];
  var plan = E.planCarryIn(model, occ, {
    threadId: thread.threadId,
    subject: thread.subject,
    gmailUrl: thread.url,
    kind: o.kind || QUEUE_DEFAULT_KIND_,
    framing: o.framing,
    fromName: last ? last.fromName : '',
    receivedDate: last && last.date ? E.taskPlannerLocalDate(new Date(Date.parse(last.date)), tz) : ''
  }, { maxExcerpt: spec.settings.maxExcerpt });
  if (plan.action === 'APPEND') {
    DPNotesRepo.applyPlan(docId, { requests: plan.requests, baseRevisionId: model.revisionId });
  }
  void now;
  return { targetId: docId, targetType: 'DOC', metadata: { seriesKey: target.series.SeriesKey, occurrenceId: target.occurrenceId, signature: plan.signature, planAction: plan.action } };
}

/**
 * @param {object} r Result of DPEngines.runOperation.
 * @param {string} opKey Operation key.
 * @param {object} thread Thread meta.
 * @param {object|null} target Meeting target.
 * @returns {object} makeResult-shaped result.
 */
function mapOutcome_(r, opKey, thread, target, tz) {
  var E = DPEngines;
  var base = { operationKey: opKey, sourceUrl: thread.url };
  if (r.action === 'SKIP_DONE') {
    var row = r.row || {};
    return E.makeResult(Object.assign(base, { ok: true, status: 'SKIPPED', message: 'Already processed', targetUrl: targetUrlOf_(row.TargetType, row.TargetId) }));
  }
  if (r.action === 'WAIT_IN_FLIGHT') {
    return E.makeResult(Object.assign(base, { ok: true, status: 'IN_FLIGHT', message: r.reason || 'Operation in flight' }));
  }
  if (r.action === 'ERROR' || !r.ok) {
    return E.makeResult(Object.assign(base, { ok: false, status: 'ERROR', errorCode: r.errorCode || 'ERROR', message: r.reason || 'Operation failed', retryable: r.retryable !== false }));
  }
  var done = r.row || {};
  var message = target && !target.backlog
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
  var E = DPEngines;
  var W = E.WORKFLOW_LABEL;
  var items = [];
  var seen = {};
  var todayThreads = {};

  function pagedThreadIds(label) {
    var ids = [];
    var pageToken = null;
    var pages = 0;
    do {
      var page = DPGmailRepo.listThreadsByLabel(label, { maxResults: QUEUE_PAGE_SIZE_, pageToken: pageToken });
      ids = ids.concat(page.threadIds);
      pageToken = page.nextPageToken;
      pages += 1;
    } while (pageToken && pages < QUEUE_MAX_PAGES_);
    return ids;
  }
  function push(item) {
    if (seen[item.opKey] || ctx.doneKeys[item.opKey] || ctx.blockedKeys[item.opKey]) return;
    seen[item.opKey] = true;
    items.push(item);
  }

  pagedThreadIds(W.TASK_TODAY).forEach(function(tid) {
    todayThreads[tid] = true;
    push({ opKey: E.gmailTaskKey(tid, true), threadId: tid, kind: 'TASK_TODAY', action: 'CREATE_TASK' });
  });
  pagedThreadIds(W.TASK).forEach(function(tid) {
    if (todayThreads[tid]) return;
    push({ opKey: E.gmailTaskKey(tid, false), threadId: tid, kind: 'TASK', action: 'CREATE_TASK' });
  });
  pagedThreadIds(W.WAITING).forEach(function(tid) {
    push({ opKey: E.gmailWaitingKey(tid), threadId: tid, kind: 'WAITING', action: 'CREATE_WAITING' });
  });

  if (ctx.features.NCMMS_CORE_PILOT === true) {
    var coreIds = pagedThreadIds(W.MEETING_NCMMS_CORE).filter(function(tid) { return !ctx.meetingDoneThreads[tid]; });
    if (coreIds.length) {
      try {
        var now = new Date();
        var series = ctx.registry.filter(function(r) { return r.SeriesKey === QUEUE_CORE_SERIES_ && r.Enabled !== false; })[0];
        if (!series) throw new Error('NCMMS_CORE is not enabled in the Meeting Registry');
        var occs = DPCalendarRepo.listOccurrences(series, ctx.registry, now);
        var sel = E.selectOccurrence({ occurrences: occs, series: series, now: now, timeZone: ctx.settings.timeZone });
        var hit = occs.filter(function(x) { return x.id === sel.occurrenceId; })[0];
        coreIds.forEach(function(tid) {
          // Carry-in idempotency must not depend on the freshly selected occurrence alone: a PENDING row
          // left by a crash after the Doc write is resumed on ITS occurrence even if the cutoff has since
          // rolled over to the next one (the Doc signature then makes it a no-op that just records DONE).
          var active = E.findActiveMeetingRow(ctx.ledgerRows, { threadId: tid, seriesKey: QUEUE_CORE_SERIES_, now: now });
          if (active) {
            var occId = active.OperationKey.split('|')[3];
            // findActiveMeetingRow never returns a row with corrupt metadata; if that invariant breaks,
            // this throws and the whole selection is recorded as SELECTION_FAILED (never resumed blind).
            var meta = JSON.parse(active.MetadataJson || '{}');
            var prior = occs.filter(function(x) { return x.id === occId; })[0];
            var start = prior ? prior.start : (meta.start || null);
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
 * Body of one locked queue run. One ledger read and at most one Tasks list read per run; stops
 * starting new items after QUEUE_MAX_RUN_MS_.
 * @param {boolean} dry True for DRY_RUN.
 * @param {object} features Feature flags.
 * @returns {object} makeResult-shaped summary.
 */
function runLocked_(dry, features) {
  var E = DPEngines;
  var startMs = Date.now();
  var settings = getSettings();
  var registry = DPConfig.getRegistry();
  var store = ledgerStore();
  DPLedgerRepo.beginSession();
  DPTaskRepo.beginRun(settings.tasksListId);
  try {
    var now0 = new Date();
    var doneKeys = {};
    var blockedKeys = {};
    var meetingDoneThreads = {};
    var ledgerRows = DPLedgerRepo.list({ sourceType: 'GMAIL' });
    ledgerRows.forEach(function(r) {
      if (r.Status === E.LEDGER_STATUS.DONE) {
        doneKeys[r.OperationKey] = true;
        var m = /^GMAIL\|([^|]+)\|MEETING\|/.exec(r.OperationKey);
        if (m) meetingDoneThreads[m[1]] = true;
      } else if (r.Status === E.LEDGER_STATUS.ERROR && !E.retryDecision(r, now0).retry) {
        blockedKeys[r.OperationKey] = true; // permanent, backing off, or out of attempts: manual retry only
      }
    });
    var errors = [];
    var items = collectItems_({ features: features, settings: settings, registry: registry, doneKeys: doneKeys, blockedKeys: blockedKeys, ledgerRows: ledgerRows, meetingDoneThreads: meetingDoneThreads, errors: errors });
    var metaByThread = {};
    var plan = E.planBatch({
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
    var counts = { candidates: items.length, processed: 0, skipped: 0, inFlight: 0, errors: 0, quarantined: plan.quarantined.length, deferred: 0, notStarted: 0, dryRun: dry };
    var messages = [];
    if (!dry) {
      plan.quarantined.forEach(function(q) { if (q.ledgerRow) store.put(q.ledgerRow); });
    } else {
      plan.quarantined.forEach(function(q) { messages.push('Would quarantine: ' + q.errorMessage); });
    }
    var collectErrors = errors.length; // selection failures; item failures are counted in the loop
    var timeLimited = false;
    for (var i = 0; i < plan.toProcess.length; i++) {
      if (Date.now() - startMs >= QUEUE_MAX_RUN_MS_) {
        timeLimited = true;
        counts.notStarted = plan.toProcess.length - i;
        break;
      }
      var item = plan.toProcess[i];
      var r = executeRoute({ kind: item.kind, threadId: item.threadId, thread: metaByThread[item.threadId], seriesKey: item.seriesKey, occurrenceInfo: item.occurrenceInfo,
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
    var status = dry ? 'DRY_RUN' : 'DONE';
    // DRY_RUN never touches the live HUB_LAST_RUN record, only its own clearly named property.
    PropertiesService.getUserProperties().setProperty(dry ? QUEUE_LAST_RUN_DRY_PROP_ : QUEUE_LAST_RUN_PROP_, JSON.stringify({ at: new Date().toISOString(), status: status, counts: counts }));
    var done = !timeLimited && items.length <= settings.batchSize;
    return E.makeResult({ ok: counts.errors === 0, status: status,
      message: (dry ? 'Dry run: ' : '') + counts.processed + ' processed, ' + counts.skipped + ' skipped, ' + counts.errors + ' errors, ' + counts.quarantined + ' quarantined' +
        (timeLimited ? ', stopped at the ' + (QUEUE_MAX_RUN_MS_ / 60000) + ' minute time limit (' + counts.notStarted + ' not started; they resume next run)' : ''),
      counts: counts, messages: messages, errors: errors, done: done });
  } finally {
    DPTaskRepo.endRun();
    DPLedgerRepo.endSession();
  }
}

/**
 * Shared implementation for the RPC and the dispatcher.
 * @param {boolean} forceDry Only ever forces DRY_RUN on; never turns it off.
 * @returns {object} makeResult-shaped result.
 */
function runQueue(forceDry) {
  var missing = missingDependency_();
  if (missing) return typeof DPEngines === 'undefined' ? { ok: false, message: 'DPEngines is not loaded' } : setupResult_('Missing dependency ' + missing);
  try {
    var features = getFeatures();
    if (features.GMAIL_ROUTER !== true) {
      return DPEngines.makeResult({ ok: true, status: 'NOOP', message: 'GMAIL_ROUTER flag is off' });
    }
    var dry = !!forceDry || features.DRY_RUN === true;
    var locked = withLock(QUEUE_LOCK_WAIT_MS_, function() { return runLocked_(dry, features); });
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
