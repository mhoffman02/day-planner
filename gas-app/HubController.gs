/**
 * @file HubController.gs
 * @description google.script.run RPC surface of the Gmail/Meeting hub (Phase 28). Every function
 * returns a DPEngines.makeResult-shaped object (never throws to the client), validates its inputs,
 * checks the feature flags it needs, verifies the Gmail thread / Calendar occurrence still exists,
 * takes the script lock, checks the ledger and only then acts (see QueueProcessor.executeRoute).
 * Gmail is read-only; nothing here writes Gmail. DRY_RUN makes every write a "Would ..." message.
 * Message bodies are used in memory for scoring only and are stripped from every return value.
 *
 * Each RPC is exported as global._xInternal (alias) and needs a matching top-level delegator in
 * Code.gs; see .agents/rules/gas-namespace-iife.md. Literal-only top level; cross-file globals are
 * read lazily (.agents/rules/gas-global-init-order.md).
 */
(function(global) {

var HUB_LOCK_WAIT_MS_ = 10000;
var HUB_TRIAGE_LIMIT_DEFAULT_ = 40;
var HUB_TRIAGE_LIMIT_MAX_ = 100;
var HUB_EVENT_ID_RE_ = /^[A-Za-z0-9_.-]{1,128}$/;
var HUB_SERIES_KEY_RE_ = /^[A-Z0-9_]{1,40}$/;
var HUB_OPKEY_RE_ = /^[A-Za-z0-9_.~|-]{1,300}$/;
var HUB_UPCOMING_COUNT_ = 5;
var HUB_TRIAGE_LABELS_ = ['00_AR', 'FYI_Candidate', 'VIP'];
var HUB_LAST_RUN_PROP_ = 'HUB_LAST_RUN';
var HUB_LAST_RUN_DRY_PROP_ = 'HUB_LAST_RUN_DRY';
var HUB_COUNT_ONLY_LIMIT_ = 20;
var HUB_TRIGGER_HANDLER_ = 'hubDispatch';
// Stable client keys for the four triage queues (DPEngines.TRIAGE_QUEUE values are display names).
var HUB_QUEUE_KEYS_ = { 'Direct Action': 'directAction', 'Meeting Carry-ins': 'meetingCarryIns', 'System Exceptions': 'systemExceptions', 'FYI/Reading': 'fyiReading' };

/**
 * @param {string} code Error code.
 * @param {string} message Message.
 * @param {boolean} [literal] True for fixed, already-safe text (skips id-run sanitizing).
 * @returns {object} Failed result.
 */
function fail_(code, message, literal) {
  return DPEngines.makeResult({ ok: false, status: 'ERROR', errorCode: code, message: literal ? message : DPEngines.sanitizeError(message) });
}

/**
 * @param {*} err Thrown value.
 * @returns {object} Failed result with a sanitized message (logged without bodies).
 */
function failFrom_(err) {
  DPQueue.logSafe('HubController', err);
  return fail_((err && err.code) ? String(err.code).slice(0, 40) : 'ERROR', err);
}

/**
 * Dependency + flag preflight shared by every RPC.
 * @param {string[]} needed Feature flags that must all be true.
 * @param {{fresh?:boolean}} [opts] fresh re-reads the Config tab when the hub Sheet already exists.
 * @returns {{failure:(object|null), features:(object|null)}} Either a failed result or the flags.
 */
function preflight_(needed, opts) {
  if (typeof DPEngines === 'undefined') return { failure: { ok: false, status: 'ERROR', errorCode: 'SETUP_ERROR', message: 'DPEngines is not loaded' }, features: null };
  if (typeof DPQueue === 'undefined') return { failure: fail_('SETUP_ERROR', 'QueueProcessor is not loaded'), features: null };
  var missing = DPQueue.missingDependency();
  if (missing) return { failure: DPQueue.setupResult('Missing dependency ' + missing), features: null };
  var features = DPQueue.getFeatures(opts);
  for (var i = 0; i < needed.length; i++) {
    if (features[needed[i]] !== true) return { failure: fail_('FLAG_OFF', needed[i] + ' flag is off', true), features: features };
  }
  return { failure: null, features: features };
}

/**
 * @param {*} id Thread id candidate.
 * @returns {string|null} Validation error message or null.
 */
function badThread_(id) {
  try {
    DPGmailRepo.validateThreadId(id);
    return null;
  } catch (err) {
    // Not DPQueue.logSafe: routeThreadToTask validates before preflight_ has checked DPQueue is loaded.
    console.error('HubController: thread id failed validation, rejecting as INVALID_THREAD_ID: ' + DPEngines.sanitizeError(err) + '\n' + DPEngines.stackFrames(err && err.stack));
    return DPEngines.sanitizeError(err);
  }
}

/**
 * Runs a state-changing action under the script lock.
 * @param {function(): object} fn Action.
 * @returns {object} Action result, or a LOCK_BUSY result.
 */
function locked_(fn) {
  var out = DPQueue.withLock(HUB_LOCK_WAIT_MS_, fn);
  if (!out.locked) return DPEngines.makeResult({ ok: false, status: 'LOCK_BUSY', errorCode: 'LOCK_BUSY', message: 'Another operation is running; try again shortly' });
  return out.value;
}

/**
 * Shared body of the route RPCs.
 * @param {string} kind TASK, TASK_TODAY, WAITING or MEETING.
 * @param {string} threadId Gmail thread id.
 * @param {object} extra Extra executeRoute spec fields.
 * @param {string[]} flags Flags required.
 * @returns {object} Result.
 */
function route_(kind, threadId, extra, flags) {
  var pre = preflight_(flags);
  if (pre.failure) return pre.failure;
  var bad = badThread_(threadId);
  if (bad) return fail_('INVALID_THREAD_ID', bad);
  try {
    var settings = DPQueue.getSettings();
    return locked_(function() {
      var spec = { kind: kind, threadId: threadId, dryRun: pre.features.DRY_RUN === true, settings: settings };
      Object.keys(extra).forEach(function(k) { spec[k] = extra[k]; });
      return DPQueue.executeRoute(spec);
    });
  } catch (err) {
    return failFrom_(err);
  }
}

/**
 * @param {*} options Client supplied options.
 * @returns {object} A plain object (never null).
 */
function opts_(options) {
  return options && typeof options === 'object' ? options : {};
}

/**
 * Creates one Task from a Gmail thread. Task-Today is due today in the configured time zone.
 * @param {string} threadId Gmail thread id.
 * @param {{today?:boolean, priority?:string, again?:boolean}} [options] today selects Task-Today.
 * @returns {object} makeResult-shaped result.
 */
function routeThreadToTask(threadId, options) {
  var o = opts_(options);
  var extra = { options: { priority: o.priority } };
  var badId = badThread_(threadId);
  if (badId) return fail_('INVALID_THREAD_ID', badId);
  if (o.again === true) extra.opKey = DPEngines.gmailTaskKey(String(threadId) + '~' + new Date().getTime().toString(36), o.today === true);
  return route_(o.today === true ? 'TASK_TODAY' : 'TASK', threadId, extra, ['GMAIL_ROUTER']);
}

/**
 * Creates a Waiting item (a Task tagged [Waiting]).
 * @param {string} threadId Gmail thread id.
 * @param {{waitingOn?:string, nagDate?:string, priority?:string}} [options] Waiting details.
 * @returns {object} makeResult-shaped result.
 */
function routeThreadToWaiting(threadId, options) {
  var o = opts_(options);
  if (o.nagDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(o.nagDate))) return fail_('INVALID_INPUT', 'nagDate must be YYYY-MM-DD');
  return route_('WAITING', threadId, { options: { waitingOn: o.waitingOn ? String(o.waitingOn).slice(0, 120) : undefined, nagDate: o.nagDate, priority: o.priority } }, ['GMAIL_ROUTER']);
}

/**
 * Routes a pointer-only carry-in to a meeting occurrence (or the series backlog).
 * @param {string} threadId Gmail thread id.
 * @param {string|null} occurrenceId Calendar occurrence id; the series key when options.backlog is true; null with options.mode.
 * @param {{seriesKey?:string, mode?:string, backlog?:boolean, framing?:string, kind?:string}} [options] Routing options.
 * @returns {object} makeResult-shaped result.
 */
function routeThreadToMeeting(threadId, occurrenceId, options) {
  var o = opts_(options);
  var extra = { options: { framing: o.framing ? String(o.framing).slice(0, 300) : undefined, kind: o.kind ? String(o.kind).slice(0, 60) : undefined } };
  if (o.backlog === true) {
    if (typeof occurrenceId !== 'string' || !HUB_SERIES_KEY_RE_.test(occurrenceId)) return fail_('INVALID_INPUT', 'A series key is required for backlog routing');
    extra.seriesKey = occurrenceId;
    extra.override = { mode: 'backlog' };
  } else {
    if (typeof o.seriesKey !== 'string' || !HUB_SERIES_KEY_RE_.test(o.seriesKey)) return fail_('INVALID_INPUT', 'options.seriesKey is required');
    extra.seriesKey = o.seriesKey;
    if (occurrenceId !== null && occurrenceId !== undefined) {
      if (typeof occurrenceId !== 'string' || !HUB_EVENT_ID_RE_.test(occurrenceId)) return fail_('INVALID_INPUT', 'Invalid occurrence id');
      extra.occurrenceId = occurrenceId;
    } else if (o.mode === 'current') {
      extra.override = { mode: 'current' };
    } else if (o.mode !== undefined && o.mode !== 'recommended') {
      return fail_('INVALID_INPUT', 'Unknown mode');
    }
  }
  return route_('MEETING', threadId, extra, ['GMAIL_ROUTER']);
}

/**
 * Removes a thread from the planner triage set (ledger only; Gmail is untouched).
 * @param {string} threadId Gmail thread id.
 * @returns {object} makeResult-shaped result.
 */
function dismissTriageItem(threadId) {
  var pre = preflight_(['GMAIL_ROUTER']);
  if (pre.failure) return pre.failure;
  var bad = badThread_(threadId);
  if (bad) return fail_('INVALID_THREAD_ID', bad);
  try {
    var E = DPEngines;
    var opKey = 'GMAIL|' + threadId + '|DISMISS';
    if (!DPGmailRepo.threadExists(threadId)) return fail_('THREAD_NOT_FOUND', 'Gmail thread not found');
    return locked_(function() {
      var existing = DPLedgerRepo.get(opKey);
      if (existing && existing.Status === E.LEDGER_STATUS.DONE) return E.makeResult({ ok: true, operationKey: opKey, status: 'SKIPPED', message: 'Already dismissed' });
      if (pre.features.DRY_RUN === true) return E.makeResult({ ok: true, operationKey: opKey, status: 'DRY_RUN', message: 'Would dismiss from triage' });
      var now = new Date();
      var row = E.beginOp({ opKey: opKey, sourceType: 'GMAIL', sourceId: threadId, action: 'DISMISS', targetType: 'PLANNER' }, now);
      DPLedgerRepo.upsert(E.completeOp(row, now, {}));
      return E.makeResult({ ok: true, operationKey: opKey, status: 'DONE', message: 'Dismissed from triage', sourceUrl: DPGmailRepo.gmailUrl(threadId) });
    });
  } catch (err) {
    return failFrom_(err);
  }
}

/**
 * Re-runs an operation whose ledger row is ERROR.
 * @param {string} operationKey Operation key from the ledger.
 * @returns {object} makeResult-shaped result.
 */
function retryFailedOperation(operationKey) {
  var pre = preflight_(['GMAIL_ROUTER']);
  if (pre.failure) return pre.failure;
  if (typeof operationKey !== 'string' || !HUB_OPKEY_RE_.test(operationKey)) return fail_('INVALID_INPUT', 'Invalid operation key');
  var parts = operationKey.split('|');
  var kinds = { TASK: 'TASK', TASK_TODAY: 'TASK_TODAY', WAITING: 'WAITING', MEETING: 'MEETING' };
  if (parts[0] !== 'GMAIL' || !parts[1] || !kinds[parts[2]]) return fail_('INVALID_INPUT', 'Operation is not retryable');
  var threadId = parts[1].split('~')[0];
  var bad = badThread_(threadId);
  if (bad) return fail_('INVALID_THREAD_ID', bad);
  try {
    var settings = DPQueue.getSettings();
    return locked_(function() {
      var row = DPLedgerRepo.get(operationKey);
      if (!row) return fail_('NOT_FOUND', 'No ledger row for that operation');
      if (row.Status !== DPEngines.LEDGER_STATUS.ERROR) return fail_('NOT_RETRYABLE', 'Operation is not in ERROR status');
      var spec = { kind: kinds[parts[2]], threadId: threadId, opKey: operationKey, dryRun: pre.features.DRY_RUN === true, settings: settings, options: {} };
      if (parts[2] === 'MEETING') {
        var meta;
        try { meta = JSON.parse(row.MetadataJson || '{}'); } catch (e) {
          // Never guess the destination series: fail the retry and leave the ERROR row as is.
          DPQueue.logSafe('HubController: corrupt MetadataJson on a MEETING retry, refusing to guess the series (retry failed)', e);
          return fail_('CORRUPT_METADATA', 'Cannot retry: this operation\'s saved routing metadata is corrupt. Route the thread again from the triage board.', true);
        }
        if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
          DPQueue.logSafe('HubController: MetadataJson on a MEETING retry is not an object, refusing to guess the series (retry failed)', new Error('corrupt MetadataJson'));
          return fail_('CORRUPT_METADATA', 'Cannot retry: this operation\'s saved routing metadata is corrupt. Route the thread again from the triage board.', true);
        }
        if (parts[3] && parts[3].indexOf('BACKLOG-') === 0) {
          spec.seriesKey = parts[3].slice(8);
          spec.override = { mode: 'backlog' };
        } else {
          spec.seriesKey = meta.seriesKey || 'NCMMS_CORE';
          spec.occurrenceId = parts[3];
        }
      }
      return DPQueue.executeRoute(spec);
    });
  } catch (err) {
    return failFrom_(err);
  }
}

/**
 * @param {object} series Registry row.
 * @param {Array<object>} occs Occurrences.
 * @param {Date} now Current instant.
 * @param {string} tz Time zone.
 * @returns {Array<object>} Up to a few upcoming occurrences with cutoffs.
 */
function describeUpcoming_(series, occs, now, tz) {
  var E = DPEngines;
  return occs.filter(function(o) { return Date.parse(o.end || o.start) > now.getTime(); })
    .sort(function(a, b) { return Date.parse(a.start) - Date.parse(b.start); })
    .slice(0, HUB_UPCOMING_COUNT_)
    .map(function(o) {
      var sel = E.selectOccurrence({ occurrences: occs, series: series, now: now, timeZone: tz, override: { mode: 'specific', occurrenceId: o.id } });
      return { occurrenceId: o.id, start: o.start, end: o.end, cutoffISO: sel.cutoffISO, date: E.taskPlannerLocalDate(new Date(Date.parse(o.start)), tz), summary: o.summary };
    });
}

/**
 * Recommended occurrence plus upcoming choices for each suggested destination of a thread.
 * @param {string} threadId Gmail thread id.
 * @returns {object} makeResult-shaped result with data in choices.
 */
function getUpcomingMeetingChoices(threadId) {
  var pre = preflight_(['GMAIL_ROUTER']);
  if (pre.failure) return pre.failure;
  var bad = badThread_(threadId);
  if (bad) return fail_('INVALID_THREAD_ID', bad);
  try {
    var E = DPEngines;
    var settings = DPQueue.getSettings();
    var thread = DPGmailRepo.getThreadMeta(threadId, null);
    var routing = E.suggestDestinations(thread.labels);
    var registry = DPConfig.getRegistry();
    var now = new Date();
    var choices = routing.suggestions.map(function(s) {
      var series = registry.filter(function(r) { return r.SeriesKey === s.seriesKey && r.Enabled !== false; })[0];
      if (!series) return { seriesKey: s.seriesKey, reason: s.reason, unavailable: true };
      var occs = DPCalendarRepo.listOccurrences(series, registry, now);
      var entry = { seriesKey: s.seriesKey, displayName: series.DisplayName, reason: s.reason, upcoming: describeUpcoming_(series, occs, now, settings.timeZone), recommended: null };
      try {
        entry.recommended = E.selectOccurrence({ occurrences: occs, series: series, now: now, timeZone: settings.timeZone });
      } catch (selErr) {
        DPQueue.logSafe('HubController: no recommended occurrence for ' + s.seriesKey + ', returning upcoming choices without one', selErr);
        entry.recommendedError = E.sanitizeError(selErr);
      }
      return entry;
    });
    return E.makeResult({ ok: true, status: 'OK', sourceUrl: thread.url, message: choices.length + ' destination(s) suggested', choices: choices,
      requireConfirmation: routing.requireConfirmation, humanReviewOnly: routing.humanReviewOnly, overrides: ['current', 'recommended', 'specific', 'backlog'] });
  } catch (err) {
    return failFrom_(err);
  }
}

/**
 * Meeting prep data: target occurrence, upcoming list, carry-in count and the notes Doc link.
 * @param {string} seriesKey Registry series key.
 * @param {string|null} occurrenceId Occurrence id, or null for the recommended upcoming one.
 * @returns {object} makeResult-shaped result.
 */
function getMeetingPrep(seriesKey, occurrenceId) {
  var pre = preflight_(['GMAIL_ROUTER', 'NCMMS_CORE_PILOT']);
  if (pre.failure) return pre.failure;
  if (typeof seriesKey !== 'string' || !HUB_SERIES_KEY_RE_.test(seriesKey)) return fail_('INVALID_INPUT', 'Invalid series key');
  if (occurrenceId !== null && occurrenceId !== undefined && (typeof occurrenceId !== 'string' || !HUB_EVENT_ID_RE_.test(occurrenceId))) return fail_('INVALID_INPUT', 'Invalid occurrence id');
  try {
    var E = DPEngines;
    var settings = DPQueue.getSettings();
    var registry = DPConfig.getRegistry();
    var series = registry.filter(function(r) { return r.SeriesKey === seriesKey && r.Enabled !== false; })[0];
    if (!series) return fail_('SERIES_NOT_FOUND', 'Meeting series is not configured or not enabled');
    var now = new Date();
    var occs = DPCalendarRepo.listOccurrences(series, registry, now);
    var sel = E.selectOccurrence({ occurrences: occs, series: series, now: now, timeZone: settings.timeZone,
      override: occurrenceId ? { mode: 'specific', occurrenceId: occurrenceId } : undefined });
    var hit = occs.filter(function(o) { return o.id === sel.occurrenceId; })[0];
    var date = E.taskPlannerLocalDate(new Date(Date.parse(hit.start)), settings.timeZone);
    var count = null;
    var warning = null;
    if (series.HumanNotesDocId) {
      try {
        count = DPNotesRepo.carryInCount(series.HumanNotesDocId, { date: date, displayName: series.DisplayName });
      } catch (docErr) {
        DPQueue.logSafe('HubController: carry-in count unavailable, returning meeting prep with a warning', docErr);
        warning = E.sanitizeError(docErr);
      }
    } else {
      count = 0;
    }
    return E.makeResult({ ok: true, status: 'OK', message: series.DisplayName + ' on ' + date, series: { seriesKey: series.SeriesKey, displayName: series.DisplayName, prepMinutes: series.PrepMinutes },
      occurrence: { occurrenceId: sel.occurrenceId, start: hit.start, end: hit.end, date: date, cutoffISO: sel.cutoffISO, reason: sel.reason, deferred: !!sel.deferred, htmlLink: hit.htmlLink || null },
      upcoming: describeUpcoming_(series, occs, now, settings.timeZone), carryInCount: count, notesDocUrl: series.HumanNotesDocId ? 'https://docs.google.com/document/d/' + series.HumanNotesDocId + '/edit' : null, warning: warning });
  } catch (err) {
    return failFrom_(err);
  }
}

/**
 * Builds the triage board: deterministic score, queue, destination suggestions and ledger status
 * per candidate thread. Bodies are scored in memory and never returned.
 * @param {{labels?:string[], limit?:number, includeDismissed?:boolean}} [filters] Board filters.
 * @returns {object} makeResult-shaped result with queues.
 */
function getTriageBoard(filters) {
  var pre = preflight_(['GMAIL_ROUTER', 'TRIAGE_BOARD']);
  if (pre.failure) return pre.failure;
  var f = opts_(filters);
  // countOnly (TRIAGE_REFRESH job): metadata-format reads and a smaller cap, since only queue sizes are wanted.
  var countOnly = f.countOnly === true;
  var limit = Math.min(Math.max(parseInt(f.limit, 10) || HUB_TRIAGE_LIMIT_DEFAULT_, 1), countOnly ? HUB_COUNT_ONLY_LIMIT_ : HUB_TRIAGE_LIMIT_MAX_);
  var labels = HUB_TRIAGE_LABELS_.concat([DPEngines.WORKFLOW_LABEL.REVIEW, DPEngines.WORKFLOW_LABEL.MEETING, DPEngines.WORKFLOW_LABEL.READ]);
  if (Array.isArray(f.labels) && f.labels.length && f.labels.length <= 10 && f.labels.every(function(l) { return typeof l === 'string' && l.length <= 100; })) labels = f.labels;
  try {
    var E = DPEngines;
    var ids = [];
    var seen = {};
    labels.forEach(function(label) {
      DPGmailRepo.listThreadsByLabel(label, { maxResults: limit }).threadIds.forEach(function(id) {
        if (!seen[id] && ids.length < limit) { seen[id] = true; ids.push(id); }
      });
    });
    var ledgerByThread = {};
    var dismissed = {};
    DPLedgerRepo.list({ sourceType: 'GMAIL' }).forEach(function(r) {
      if (/\|DISMISS$/.test(r.OperationKey)) { if (r.Status === E.LEDGER_STATUS.DONE) dismissed[r.SourceId] = true; return; }
      var cur = ledgerByThread[r.SourceId];
      if (!cur || (r.Status === E.LEDGER_STATUS.ERROR && cur.Status !== E.LEDGER_STATUS.ERROR) || (cur.Status !== E.LEDGER_STATUS.ERROR && String(r.UpdatedAt) > String(cur.UpdatedAt))) ledgerByThread[r.SourceId] = r;
    });
    var queues = {};
    Object.keys(E.TRIAGE_QUEUE).forEach(function(k) { queues[HUB_QUEUE_KEYS_[E.TRIAGE_QUEUE[k]]] = []; });
    var errors = 0;
    ids.forEach(function(id) {
      if (dismissed[id] && f.includeDismissed !== true) return;
      try {
        var t = DPGmailRepo.getThreadMeta(id, { withBody: !countOnly });
        var scored = E.scoreThread({ labels: t.labels, userEmail: t.userEmail, messages: t.messages.map(function(m) {
          return { from: m.from, to: m.to, cc: m.cc, date: m.date, bodyText: m.bodyText, isFromUser: m.isFromUser };
        }) });
        var queue = E.queueFor({ labels: t.labels }, scored);
        var last = t.messages[t.messages.length - 1];
        var led = ledgerByThread[id] || null;
        var routing = E.suggestDestinations(t.labels);
        queues[HUB_QUEUE_KEYS_[queue]].push({
          threadId: id, url: t.url, subject: t.subject, fromName: last ? last.fromName : '', date: last ? last.date : '', labels: t.labels,
          score: scored.score, band: scored.band, signals: scored.signals.map(function(s) { return s.id; }), queue: queue,
          ticketKey: E.extractExternalTicketKey(t.subject, last ? last.from : '', null),
          suggestions: routing.suggestions, requireConfirmation: routing.requireConfirmation, humanReviewOnly: routing.humanReviewOnly,
          operationKey: led ? led.OperationKey : null, ledgerStatus: led ? led.Status : null, errorMessage: led && led.Status === E.LEDGER_STATUS.ERROR ? led.ErrorMessage : null
        });
      } catch (itemErr) {
        errors += 1;
        DPQueue.logSafe('getTriageBoard item', itemErr);
      }
    });
    Object.keys(queues).forEach(function(q) { queues[q].sort(function(a, b) { return b.score - a.score; }); });
    var total = Object.keys(queues).reduce(function(n, q) { return n + queues[q].length; }, 0);
    return E.makeResult({ ok: true, status: 'OK', message: total + ' thread(s) triaged', queues: queues, errors: errors, dryRun: pre.features.DRY_RUN === true });
  } catch (err) {
    return failFrom_(err);
  }
}

/**
 * Discovers recurring event ids for registry series; persists them only outside DRY_RUN and only
 * when the config layer can write them.
 * @returns {object} makeResult-shaped result.
 */
function discoverMeetingSeries() {
  var pre = preflight_([]);
  if (pre.failure) return pre.failure;
  try {
    var dry = pre.features.DRY_RUN === true;
    var out = DPCalendarRepo.discoverSeries(DPConfig.getRegistry(), new Date(), { persist: !dry });
    var message = out.discovered.length + ' series matched' + (dry ? ' (dry run, not saved)' : (out.persisted ? ', recurring ids saved' : '')) + (out.persistGap ? '; ' + out.persistGap : '');
    return DPEngines.makeResult({ ok: true, status: dry ? 'DRY_RUN' : 'OK', message: message, discovered: out.discovered, stale: out.stale, persisted: out.persisted });
  } catch (err) {
    return failFrom_(err);
  }
}

/**
 * Hub status: flags, dry-run, last queue run, ledger counts, dispatcher trigger count.
 * @returns {object} {ok, flags, dryRun, lastRun, counts, triggers, message}.
 */
function getHubStatus() {
  var pre = preflight_([], { fresh: true });
  if (pre.failure) return pre.failure;
  try {
    // This runs on app load: with the hub unprovisioned or every flag OFF it must not touch Drive/Sheets.
    var counts = {};
    var anyOn = Object.keys(pre.features).some(function(k) { return k !== 'DRY_RUN' && pre.features[k] === true; });
    if (anyOn && DPConfig.isProvisioned()) {
      DPLedgerRepo.list({ sourceType: 'GMAIL' }).forEach(function(r) { counts[r.Status] = (counts[r.Status] || 0) + 1; });
    }
    var props = PropertiesService.getUserProperties();
    var lastRun = null;
    var lastDry = null;
    try { lastRun = JSON.parse(props.getProperty(HUB_LAST_RUN_PROP_) || 'null'); } catch (e) { DPQueue.logSafe('HubController: corrupt last-run property, reporting no last run', e); lastRun = null; }
    try { lastDry = JSON.parse(props.getProperty(HUB_LAST_RUN_DRY_PROP_) || 'null'); } catch (e) { DPQueue.logSafe('HubController: corrupt last-dry-run property, reporting no last dry run', e); lastDry = null; }
    if (lastDry && (!lastRun || String(lastDry.at) > String(lastRun.at))) lastRun = lastDry;
    var triggers = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === HUB_TRIGGER_HANDLER_; }).length;
    return DPEngines.makeResult({ ok: true, status: 'OK', message: 'Hub status', flags: pre.features, dryRun: pre.features.DRY_RUN === true, lastRun: lastRun, counts: counts, triggers: triggers });
  } catch (err) {
    return failFrom_(err);
  }
}

/**
 * @param {string} flag Flag that would have to be on.
 * @param {*} occurrenceId Occurrence id (validated).
 * @param {*} [selectedItems] Items (validated when present).
 * @returns {object} Failed result: gated off, or not implemented in this build.
 */
function geminiStub_(flag, occurrenceId, selectedItems) {
  var pre = preflight_([]);
  if (pre.failure) return pre.failure;
  if (typeof occurrenceId !== 'string' || !HUB_EVENT_ID_RE_.test(occurrenceId)) return fail_('INVALID_INPUT', 'Invalid occurrence id');
  if (selectedItems !== undefined && !Array.isArray(selectedItems)) return fail_('INVALID_INPUT', 'selectedItems must be an array');
  if (pre.features[flag] !== true) return fail_('FLAG_OFF', flag + ' flag off', true);
  return fail_('NOT_IMPLEMENTED', 'Gemini notes processing is not implemented in this build (Phase 6 interface only)');
}

/**
 * @param {string} occurrenceId Occurrence id.
 * @returns {object} ok:false unless GEMINI_DISCOVERY is on (and not implemented yet).
 */
function discoverGeminiNotes(occurrenceId) {
  return geminiStub_('GEMINI_DISCOVERY', occurrenceId);
}

/**
 * @param {string} occurrenceId Occurrence id.
 * @returns {object} ok:false unless GEMINI_RECONCILIATION is on (and not implemented yet).
 */
function getProposedMeetingActions(occurrenceId) {
  return geminiStub_('GEMINI_RECONCILIATION', occurrenceId);
}

/**
 * @param {string} occurrenceId Occurrence id.
 * @param {Array<object>} selectedItems User-confirmed items.
 * @returns {object} ok:false unless GEMINI_RECONCILIATION is on (and not implemented yet).
 */
function confirmMeetingActions(occurrenceId, selectedItems) {
  return geminiStub_('GEMINI_RECONCILIATION', occurrenceId, selectedItems || []);
}

// ── Export surface ───────────────────────────────────────────────────────────
// Every name below is called via google.script.run (Script.html) and therefore also needs a
// top-level delegator in Code.gs.
global._getTriageBoardInternal = getTriageBoard;                   // google.script.run
global._getMeetingPrepInternal = getMeetingPrep;                   // google.script.run
global._getUpcomingMeetingChoicesInternal = getUpcomingMeetingChoices; // google.script.run
global._routeThreadToTaskInternal = routeThreadToTask;             // google.script.run
global._routeThreadToWaitingInternal = routeThreadToWaiting;       // google.script.run
global._routeThreadToMeetingInternal = routeThreadToMeeting;       // google.script.run
global._dismissTriageItemInternal = dismissTriageItem;             // google.script.run
global._discoverMeetingSeriesInternal = discoverMeetingSeries;     // google.script.run
global._retryFailedOperationInternal = retryFailedOperation;       // google.script.run
global._getHubStatusInternal = getHubStatus;                       // google.script.run
global._discoverGeminiNotesInternal = discoverGeminiNotes;         // google.script.run (stub, flag gated)
global._getProposedMeetingActionsInternal = getProposedMeetingActions; // google.script.run (stub, flag gated)
global._confirmMeetingActionsInternal = confirmMeetingActions;     // google.script.run (stub, flag gated)

})(typeof globalThis !== 'undefined' ? globalThis : this);
