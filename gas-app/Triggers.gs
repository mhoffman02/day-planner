/**
 * @file Triggers.gs
 * @description Time-driven plumbing for the Gmail/Meeting hub (Phase 28). Exactly ONE dispatcher
 * trigger (handler hubDispatch, every N minutes from the TriggerMinutes config value); there are
 * never per-occurrence triggers. hubDispatch runs the bounded workflow queue each tick and the
 * spec section 17 refresh jobs (about 06:55, 07:20, midday, end of workday) at most once per local
 * day each. The pre-existing 5-minute syncWorkspaceChanges trigger is never touched.
 * With every flag OFF, hubDispatch is a no-op.
 *
 * IIFE per .agents/rules/gas-namespace-iife.md; install/remove are IDE manual-run helpers and
 * hubDispatch is a trigger handler name string, so each needs a top-level delegator in Code.gs.
 * Literal-only top level (.agents/rules/gas-global-init-order.md).
 */
'use strict';

(function(global) {

const HUB_HANDLER_ = 'hubDispatch';
const HUB_ALLOWED_MINUTES_ = [1, 5, 10, 15, 30];
const HUB_JOB_PROP_PREFIX_ = 'HUB_JOB_';
const HUB_SCHEDULE_PROP_ = 'HUB_SCHEDULE_JSON';
const HUB_SUMMARY_PROP_ = 'HUB_JOB_SUMMARY';
const HUB_DEFAULT_SCHEDULE_ = { DAILY_REFRESH: '06:55', CORE_CARRYIN: '07:20', TRIAGE_REFRESH: '12:00', EOD_RECONCILE: '17:00' };

/**
 * @param {string} hm Time as HH:mm.
 * @returns {number} Minutes since midnight.
 */
function minutesOf_(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error('Invalid schedule time ' + JSON.stringify(hm) + ' (expected HH:mm)');
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Which refresh jobs should run on this tick (pure).
 * @param {string} nowHm Local time HH:mm.
 * @param {string} today Local date YYYY-MM-DD.
 * @param {Object<string,string>} schedule Job name to HH:mm.
 * @param {number} tickMinutes Dispatcher cadence.
 * @param {Object<string,string>} lastRun Job name to the local date it last ran.
 * @returns {string[]} Job names due now.
 */
function dueJobs(nowHm, today, schedule, tickMinutes, lastRun) {
  const now = minutesOf_(nowHm);
  return Object.keys(schedule).filter(function(job) {
    const start = minutesOf_(schedule[job]);
    return now >= start && now < start + 2 * tickMinutes && lastRun[job] !== today;
  });
}

/**
 * @returns {string[]} Delete every existing hubDispatch trigger; returns how many were removed count as array length.
 */
function deleteHubTriggers_() {
  const removed = [];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === HUB_HANDLER_) {
      ScriptApp.deleteTrigger(t);
      removed.push(t.getUniqueId());
    }
  });
  return removed;
}

/**
 * Installs the single hubDispatch trigger (idempotent: always exactly one afterwards).
 * @returns {object} makeResult-shaped result.
 */
function installHubTriggers() {
  const minutes = DPConfig.getConfig().TriggerMinutes;
  if (HUB_ALLOWED_MINUTES_.indexOf(minutes) === -1) {
    throw new Error('TriggerMinutes must be one of ' + HUB_ALLOWED_MINUTES_.join('/') + ', got ' + JSON.stringify(minutes));
  }
  deleteHubTriggers_();
  ScriptApp.newTrigger(HUB_HANDLER_).timeBased().everyMinutes(minutes).create();
  return DPEngines.makeResult({ ok: true, status: 'OK', message: 'Installed one ' + HUB_HANDLER_ + ' trigger every ' + minutes + ' minutes', minutes: minutes });
}

/**
 * Removes only the hubDispatch trigger(s); every other trigger is left alone.
 * @returns {object} makeResult-shaped result.
 */
function removeHubTriggers() {
  const removed = deleteHubTriggers_();
  return DPEngines.makeResult({ ok: true, status: 'OK', message: 'Removed ' + removed.length + ' ' + HUB_HANDLER_ + ' trigger(s)', removed: removed.length });
}

/**
 * @param {string} job Job name.
 * @param {object} features Flags.
 * @param {string} today Local date.
 * @param {object} settings Hub settings.
 * @returns {object} Small non-sensitive summary of what the job did.
 */
function runJob_(job, features, today, settings) {
  if (job === 'CORE_CARRYIN') {
    const q = DPQueue.run(false);
    return { status: q.status };
  }
  if (job === 'DAILY_REFRESH') {
    const d = DPCalendarRepo.discoverSeries(DPConfig.getRegistry(), new Date(), { persist: false });
    return { matched: d.discovered.length, stale: d.stale.length };
  }
  if (job === 'TRIAGE_REFRESH') {
    if (features.TRIAGE_BOARD !== true) return { skipped: 'TRIAGE_BOARD off' };
    const board = global._getTriageBoardInternal ? global._getTriageBoardInternal({ countOnly: true }) : null;
    const sizes = {};
    if (board && board.queues) Object.keys(board.queues).forEach(function(k) { sizes[k] = board.queues[k].length; });
    return { queues: sizes };
  }
  if (job === 'EOD_RECONCILE') {
    return { waitingDue: DPTaskRepo.listWaitingDue(today, settings.tasksListId).length };
  }
  throw new Error('Unknown hub job ' + job);
}

/**
 * Trigger handler: one bounded queue pass plus any refresh jobs that are due. No-op with the flags off.
 * @returns {object} makeResult-shaped summary.
 */
function hubDispatch() {
  if (typeof DPEngines === 'undefined' || typeof DPConfig === 'undefined' || typeof DPQueue === 'undefined') {
    console.error('hubDispatch: hub modules are not loaded');
    return { ok: false, status: 'ERROR', message: 'Hub modules are not loaded' };
  }
  try {
    const features = DPConfig.getFeatures({ fresh: true });
    if (features.GMAIL_ROUTER !== true) return DPEngines.makeResult({ ok: true, status: 'NOOP', message: 'GMAIL_ROUTER flag is off' });
    const settings = DPQueue.getSettings();
    const props = PropertiesService.getUserProperties();
    const now = new Date();
    const today = DPEngines.taskPlannerLocalDate(now, settings.timeZone);
    let schedule = HUB_DEFAULT_SCHEDULE_;
    const override = props.getProperty(HUB_SCHEDULE_PROP_);
    if (override) schedule = JSON.parse(override);
    const lastRun = {};
    Object.keys(schedule).forEach(function(j) { lastRun[j] = props.getProperty(HUB_JOB_PROP_PREFIX_ + j); });
    const due = dueJobs(Utilities.formatDate(now, settings.timeZone, 'HH:mm'), today, schedule, settings.triggerMinutes, lastRun);
    const summary = { queue: null, jobs: {} };
    // CORE_CARRYIN is itself a queue pass; run the regular pass only once per tick.
    const queueOnce = due.indexOf('CORE_CARRYIN') === -1;
    if (queueOnce) summary.queue = DPQueue.run(false, { scheduled: true }).status;
    due.forEach(function(job) {
      try {
        const jobResult = runJob_(job, features, today, settings);
        summary.jobs[job] = jobResult;
        if (job === 'CORE_CARRYIN') summary.queue = jobResult.status;
        // A busy lock or a failed pass did not do the day's work: leave the job unmarked so the next tick retries.
        const transient = jobResult.status === 'LOCK_BUSY' || jobResult.status === 'ERROR';
        if (features.DRY_RUN !== true && !transient) props.setProperty(HUB_JOB_PROP_PREFIX_ + job, today);
      } catch (jobErr) {
        DPQueue.logSafe('hubDispatch job ' + job, jobErr);
        summary.jobs[job] = { error: DPEngines.sanitizeError(jobErr) };
      }
    });
    props.setProperty(HUB_SUMMARY_PROP_, JSON.stringify({ at: now.toISOString(), summary: summary }));
    return DPEngines.makeResult({ ok: true, status: 'OK', message: 'Dispatched ' + due.length + ' job(s)', summary: summary });
  } catch (err) {
    DPQueue.logSafe('hubDispatch', err);
    return DPEngines.makeResult({ ok: false, status: 'ERROR', message: DPEngines.sanitizeError(err) });
  }
}

global.DPTriggers = Object.freeze({ dueJobs: dueJobs });   // cross-file only: UnitTests.gs

global._installHubTriggersInternal = installHubTriggers;   // IDE manual-run + Code.gs delegator
global._removeHubTriggersInternal = removeHubTriggers;     // IDE manual-run + Code.gs delegator
global._hubDispatchInternal = hubDispatch;                 // trigger handler-name string + Code.gs delegator

})(typeof globalThis !== 'undefined' ? globalThis : this);
