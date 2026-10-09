/**
 * @file hubShapes.js
 * @description One shared shape checker for hub RPC results (Phase 28). Both the client mock
 * (src/hubMock.js) and the real server controller (gas-app/HubController.gs) must satisfy it, so a
 * field the UI templates read cannot exist on only one side. Required fields are the union of the
 * plan contract (DPEngines.makeResult shape) and what Script.html / app.js / Index.html bind to.
 * Every checker returns an array of error strings (empty means conforming).
 */

const isStr = (v) => typeof v === 'string';
const isBool = (v) => typeof v === 'boolean';
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const strOrNull = (v) => v === null || isStr(v);

export const QUEUE_KEYS = ['directAction', 'meetingCarryIns', 'systemExceptions', 'fyiReading'];
export const RESULT_STATUSES = ['OK', 'DONE', 'DRY_RUN', 'SKIPPED', 'DEFERRED', 'IN_FLIGHT', 'ERROR'];

/**
 * @param {string} where Path label for messages.
 * @param {object} value Object under test.
 * @param {Object<string, function(*): boolean>} spec Field name to predicate.
 * @param {string[]} errs Error accumulator.
 */
function need(where, value, spec, errs) {
  if (!isObj(value)) { errs.push(`${where}: expected object`); return; }
  for (const [k, ok] of Object.entries(spec)) {
    if (!(k in value)) errs.push(`${where}.${k}: missing`);
    else if (!ok(value[k])) errs.push(`${where}.${k}: wrong type (${JSON.stringify(value[k])})`);
  }
}

const arrOf = (pred) => (v) => Array.isArray(v) && v.every(pred);

/**
 * @param {object} r Result.
 * @returns {string[]} Errors for the base makeResult envelope (ok, message, and the failure fields).
 */
export function checkEnvelope(r) {
  const errs = [];
  need('result', r, { ok: isBool, message: isStr }, errs);
  if (isObj(r) && r.ok === false) need('failure', r, { status: (v) => v === 'ERROR', errorCode: isStr }, errs);
  if (isObj(r) && r.ok === true && 'status' in r && !RESULT_STATUSES.includes(r.status)) errs.push(`result.status: unknown ${r.status}`);
  return errs;
}

function checkFlags(flags, featureKeys, errs) {
  if (!isObj(flags)) { errs.push('flags: expected object'); return; }
  const keys = Object.keys(flags).sort();
  const want = [...featureKeys].sort();
  if (JSON.stringify(keys) !== JSON.stringify(want)) errs.push(`flags: keys ${keys} differ from DEFAULT_FEATURES ${want}`);
  keys.forEach((k) => { if (!isBool(flags[k])) errs.push(`flags.${k}: not boolean`); });
}

/**
 * @param {object} r getHubStatus result.
 * @param {string[]} featureKeys DPEngines.DEFAULT_FEATURES keys.
 * @returns {string[]} Errors.
 */
export function checkHubStatus(r, featureKeys) {
  const errs = checkEnvelope(r);
  if (!isObj(r) || r.ok !== true) return errs;
  need('status', r, { flags: isObj, dryRun: isBool, lastRun: (v) => v === null || isObj(v), counts: isObj, triggers: isNum }, errs);
  checkFlags(r.flags, featureKeys, errs);
  if (isObj(r.lastRun)) need('lastRun', r.lastRun, { at: isStr, status: isStr, counts: isObj }, errs);
  if (isObj(r.counts)) Object.entries(r.counts).forEach(([k, v]) => { if (!isNum(v)) errs.push(`counts.${k}: not number`); });
  return errs;
}

const suggestion = (s) => isObj(s) && isStr(s.seriesKey) && isStr(s.reason);

/**
 * @param {object} r getTriageBoard result.
 * @returns {string[]} Errors.
 */
export function checkTriageBoard(r) {
  const errs = checkEnvelope(r);
  if (!isObj(r) || r.ok !== true) return errs;
  need('board', r, { queues: isObj, dryRun: isBool }, errs);
  if (!isObj(r.queues)) return errs;
  const keys = Object.keys(r.queues).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...QUEUE_KEYS].sort())) errs.push(`queues: keys ${keys} differ from ${QUEUE_KEYS}`);
  for (const q of QUEUE_KEYS) {
    if (!Array.isArray(r.queues[q])) { errs.push(`queues.${q}: expected array`); continue; }
    r.queues[q].forEach((item, i) => {
      need(`queues.${q}[${i}]`, item, {
        threadId: isStr, url: isStr, subject: isStr, fromName: isStr, date: isStr,
        labels: arrOf(isStr), score: isNum, band: isStr, signals: arrOf(isStr), queue: isStr,
        suggestions: arrOf(suggestion), requireConfirmation: isBool, humanReviewOnly: isBool,
        ledgerStatus: strOrNull, operationKey: strOrNull, errorMessage: strOrNull
      }, errs);
      if (isObj(item) && 'body' in item) errs.push(`queues.${q}[${i}]: must not carry a message body`);
    });
  }
  return errs;
}

const occurrence = (o) => isObj(o) && isStr(o.occurrenceId) && isStr(o.start) && isStr(o.cutoffISO);

/**
 * @param {object} r getUpcomingMeetingChoices result.
 * @returns {string[]} Errors.
 */
export function checkMeetingChoices(r) {
  const errs = checkEnvelope(r);
  if (!isObj(r) || r.ok !== true) return errs;
  need('choices', r, { sourceUrl: isStr, choices: Array.isArray, requireConfirmation: isBool, humanReviewOnly: isBool, overrides: arrOf(isStr) }, errs);
  (Array.isArray(r.choices) ? r.choices : []).forEach((c, i) => {
    need(`choices[${i}]`, c, { seriesKey: isStr, reason: isStr }, errs);
    if (isObj(c) && c.unavailable === true) return;
    need(`choices[${i}]`, c, {
      displayName: isStr,
      upcoming: arrOf((o) => occurrence(o) && isStr(o.date) && isStr(o.summary)),
      recommended: (v) => v === null || (isObj(v) && isStr(v.occurrenceId) && isStr(v.reason))
    }, errs);
  });
  return errs;
}

/**
 * @param {object} r getMeetingPrep result.
 * @returns {string[]} Errors.
 */
export function checkMeetingPrep(r) {
  const errs = checkEnvelope(r);
  if (!isObj(r) || r.ok !== true) return errs;
  need('prep', r, {
    series: isObj, occurrence: isObj, upcoming: arrOf(occurrence),
    carryInCount: (v) => v === null || isNum(v), notesDocUrl: strOrNull, warning: strOrNull
  }, errs);
  need('prep.series', r.series, { seriesKey: isStr, displayName: isStr, prepMinutes: isNum }, errs);
  need('prep.occurrence', r.occurrence, {
    occurrenceId: isStr, start: isStr, end: isStr, date: isStr, cutoffISO: isStr, reason: isStr, deferred: isBool, htmlLink: strOrNull
  }, errs);
  return errs;
}

/**
 * @param {object} r route*, dismissTriageItem, retryFailedOperation or discoverMeetingSeries result.
 * @returns {string[]} Errors.
 */
export function checkRouteResult(r) {
  const errs = checkEnvelope(r);
  if (!isObj(r) || r.ok !== true) return errs;
  need('route', r, { status: isStr, operationKey: isStr }, errs);
  for (const k of ['sourceUrl', 'targetUrl']) if (k in r && !isStr(r[k])) errs.push(`route.${k}: not a string`);
  return errs;
}
