/**
 * @file hubReviewFixes.test.js
 * @description Regression tests for the Phase 28 adversarial review findings 2-6 and 8-14. Each test
 * was written and seen failing for its stated reason before the fix landed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { makeGasContext, loadEngines, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread, addCoreOccurrences } from './helpers/gasFakesHub.js';
import { isAiAllowed } from '../src/integration/aiGuard.js';
import { beginOp, failOp, claimOperation } from '../src/integration/ledger.js';
import * as ledgerMod from '../src/integration/ledger.js';

const retryDecision = (...a) => ledgerMod.retryDecision(...a);
import { planWaiting, taskPlannerReadMeta } from '../src/integration/taskPlanner.js';

const LIVE = { GMAIL_ROUTER: true, DRY_RUN: false };
const run = (ctx) => toHost(ctx._processWorkflowQueueInternal());
const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const userProps = (ctx) => ctx.PropertiesService.getUserProperties();
const MIN = 60000;

function configCtx() {
  const ctx = makeGasContext();
  loadEngines(ctx);
  loadGasFile(ctx, 'Config.gs');
  userProps(ctx).setProperty('DAY_PLANNER_ROOT_FOLDER_ID', 'FOLDER1');
  return ctx;
}

// ---------------------------------------------------------------- #2 flags OFF is a no-op
test('#2 flags OFF: app-load and every flag-gated RPC create no Sheet and make no Drive/Sheets call', () => {
  const ctx = makeHubContext({ realStores: 'cold' });
  const st = call(ctx, 'getHubStatus');
  assert.equal(st.ok, true);
  assert.equal(st.dryRun, true);
  assert.ok(Object.keys(st.flags).every((k) => (k === 'DRY_RUN' ? st.flags[k] === true : st.flags[k] === false)), JSON.stringify(st.flags));
  assert.equal(run(ctx).status, 'NOOP');
  assert.equal(toHost(ctx._hubDispatchInternal()).status, 'NOOP');
  call(ctx, 'getTriageBoard', {});
  call(ctx, 'getMeetingPrep', 'NCMMS_CORE', null);
  call(ctx, 'getUpcomingMeetingChoices', 't1');
  call(ctx, 'routeThreadToTask', 't1', {});
  call(ctx, 'dismissTriageItem', 't1');
  assert.equal(ctx.__fakes.driveFiles.length, 0, 'no hub Sheet may be created');
  assert.deepEqual(ctx.__fakes.sheetsCalls, []);
});

test('#2 setFeature persists a cheap flag cache: getFeatures needs no Sheets call afterwards', () => {
  const ctx = configCtx();
  ctx.DPConfig.setFeature('GMAIL_ROUTER', true);
  ctx.__fakes.sheetsCalls.length = 0;
  const f = toHost(ctx.DPConfig.getFeatures());
  assert.equal(f.GMAIL_ROUTER, true);
  assert.equal(f.DRY_RUN, true);
  assert.deepEqual(ctx.__fakes.sheetsCalls, []);
});

test('#2 ensureSetup is serialized: a concurrent first run is blocked while the first creates the Sheet', () => {
  const ctx = configCtx();
  const realList = ctx.Drive.Files.list;
  let nested = false;
  let blocked = false;
  ctx.Drive.Files.list = function list(...a) {
    const r = realList.apply(this, a);
    if (!nested) {
      nested = true;
      try { ctx.DPConfig.ensureSetup(); } catch { blocked = true; }
    }
    return r;
  };
  const first = ctx.DPConfig.ensureSetup();
  assert.equal(blocked, true, 'the second first-run must not enter while the first holds the setup lock');
  const second = ctx.DPConfig.ensureSetup();
  assert.equal(second, first);
  assert.equal(ctx.__fakes.driveFiles.filter((f) => f.mimeType.endsWith('spreadsheet')).length, 1);
});

test('#2 ensureSetup re-checks the stored id after acquiring the lock (two concurrent first-runs => one Sheet)', () => {
  const ctx = configCtx();
  ctx.Drive.Files.list = () => ({ items: [] }); // Drive search lag: adoption-by-name cannot save us
  const real = ctx.LockService.getUserLock;
  let first = true;
  let other = null;
  ctx.LockService.getUserLock = () => {
    const h = real();
    if (!first) return h;
    first = false;
    const w = h.waitLock.bind(h);
    h.waitLock = (ms) => {
      other = ctx.DPConfig.ensureSetup(); // the other caller wins the race while we were waiting
      return w(ms);
    };
    return h;
  };
  const mine = ctx.DPConfig.ensureSetup();
  assert.equal(mine, other);
  assert.equal(ctx.__fakes.driveFiles.filter((f) => f.mimeType.endsWith('spreadsheet')).length, 1);
});

// ---------------------------------------------------------------- #3 dp-meta marker escaping
test('#3 taskPlanner: sender name containing "-->" and "<" round-trips opKey and nagDate', () => {
  const plan = planWaiting({
    thread: { threadId: 't1', subject: 'S', url: 'https://mail.google.com/mail/#all/t1' },
    waitingOn: 'x --> y <b>', nagDate: '2026-10-10', existingTasks: [], opKey: 'GMAIL|t1|WAITING', now: new Date('2026-10-05T00:00:00Z')
  });
  assert.equal((plan.task.notes.match(/-->/g) || []).length, 1, 'only the marker terminator may contain -->');
  const meta = taskPlannerReadMeta(plan.task.notes);
  assert.equal(meta.opKey, 'GMAIL|t1|WAITING');
  assert.equal(meta.nagDate, '2026-10-10');
  assert.equal(meta.waitingOn, 'x --> y <b>');
});

test('#3 Code.gs encodeTaskMeta escapes < and > in the hidden marker and round-trips', () => {
  const codeGs = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'gas-app', 'Code.gs'), 'utf8');
  const start = codeGs.indexOf('const TASK_META_MARKER_RE');
  const encAt = codeGs.indexOf('function encodeTaskMeta(');
  const end = codeGs.indexOf('\n}\n', encAt) + 3;
  const ctx = vm.createContext({});
  vm.runInContext(`${codeGs.slice(start, end)}\nthis.enc = encodeTaskMeta; this.dec = decodeTaskMeta;`, ctx);
  const notes = ctx.enc('', { opKey: 'GMAIL|t1|WAITING', waitingOn: 'x --> y <z>', nagDate: '2026-10-10' });
  assert.equal((notes.match(/-->/g) || []).length, 1);
  const meta = JSON.parse(JSON.stringify(ctx.dec(notes)));
  assert.equal(meta.opKey, 'GMAIL|t1|WAITING');
  assert.equal(meta.nagDate, '2026-10-10');
  assert.equal(meta.waitingOn, 'x --> y <z>');
  const again = JSON.parse(JSON.stringify(ctx.dec(ctx.enc(notes, { starred: true }))));
  assert.equal(again.opKey, 'GMAIL|t1|WAITING');
  assert.equal(again.waitingOn, 'x --> y <z>');
});

// ---------------------------------------------------------------- #4 permanent errors / backoff
test('#4 pure: permanent codes and retryable:false are never auto-retried; retryable errors back off then exhaust', () => {
  const t0 = new Date('2026-10-05T10:00:00Z');
  const pend = beginOp({ opKey: 'K', sourceType: 'GMAIL', sourceId: 't', action: 'A' }, t0);
  for (const code of ['SERIES_NOT_FOUND', 'OCCURRENCE_NOT_FOUND', 'SOURCE_MISSING']) {
    const row = failOp(pend, t0, { code, message: 'x' });
    const d = retryDecision(row, new Date(t0.getTime() + 999 * 60 * MIN), {});
    assert.equal(d.retry, false, code);
    assert.equal(d.reason, 'PERMANENT');
  }
  const flagged = failOp(pend, t0, Object.assign(new Error('x'), { code: 'WEIRD', retryable: false }));
  assert.equal(retryDecision(flagged, new Date(t0.getTime() + 1e9), {}).reason, 'PERMANENT');
  const soft = failOp(pend, t0, { code: '500', message: 'Backend Error' });
  assert.equal(retryDecision(soft, t0, {}).reason, 'BACKOFF');
  assert.equal(retryDecision(soft, new Date(t0.getTime() + 6 * MIN), {}).retry, true);
  // attempts accumulate through claim -> fail cycles and stop at the cap
  let row = soft;
  let now = t0;
  const store = new Map([['K', row]]);
  for (let i = 0; i < 6; i += 1) {
    now = new Date(now.getTime() + 24 * 60 * MIN);
    const claim = claimOperation({ store: { get: (k) => store.get(k) || null, put: (r) => store.set(r.OperationKey, r) }, lock: { tryLock: () => true, releaseLock() {} }, clock: () => now, op: { opKey: 'K', sourceType: 'GMAIL', sourceId: 't', action: 'A' } });
    row = failOp(claim.row, now, { code: '500', message: 'Backend Error' });
    store.set('K', row);
  }
  assert.equal(JSON.parse(row.MetadataJson).attempts >= 5, true);
  const d = retryDecision(row, new Date(now.getTime() + 1e9), {});
  assert.deepEqual([d.retry, d.reason], [false, 'ATTEMPTS_EXHAUSTED']);
});

test('#4 queue: a permanent failure is attempted once; only retryFailedOperation re-runs it', () => {
  const ctx = makeHubContext({ features: LIVE });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  ctx.__hub.tasks.onInsert = () => { throw Object.assign(new Error('gone'), { code: 'SOURCE_MISSING', retryable: false }); };
  run(ctx);
  assert.equal(ctx.__hub.tasks.inserts, 1);
  assert.equal(ctx.__hub.ledger.rows.get('GMAIL|t1|TASK').Status, 'ERROR');
  ctx.__setNow('2026-10-07T22:00:00Z');
  run(ctx);
  run(ctx);
  assert.equal(ctx.__hub.tasks.inserts, 1, 'trigger loop must not retry a permanent error');
  call(ctx, 'retryFailedOperation', 'GMAIL|t1|TASK');
  assert.equal(ctx.__hub.tasks.inserts, 2, 'manual retry still re-runs it');
});

test('#4 queue: retryable errors back off, stop after 5 attempts, and manual retry still works', () => {
  const ctx = makeHubContext({ features: LIVE });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  ctx.__hub.tasks.failInsert = true;
  run(ctx);
  run(ctx);
  assert.equal(ctx.__hub.tasks.inserts, 1, 'immediate rerun is inside the backoff window');
  let t = Date.parse('2026-10-05T22:00:00Z');
  for (let i = 0; i < 12; i += 1) {
    t += 24 * 60 * MIN;
    ctx.__setNow(new Date(t).toISOString());
    run(ctx);
  }
  assert.equal(ctx.__hub.tasks.inserts, 5, 'cap of 5 attempts');
  call(ctx, 'retryFailedOperation', 'GMAIL|t1|TASK');
  assert.equal(ctx.__hub.tasks.inserts, 6);
});

test('#4 queue: a run whose items fail reports ok:false with each failure in errors (2026-10-10 L5: ok:true, errors:[])', () => {
  const ctx = makeHubContext({ features: LIVE });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  ctx.__hub.tasks.failInsert = true;
  const r = run(ctx);
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(r.counts.errors, 1, 'one failed item counts once');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].operationKey, 'GMAIL|t1|TASK');
  assert.equal(typeof r.errors[0].message, 'string');
  assert.ok(r.errors[0].code, JSON.stringify(r.errors[0]));
});

// ---------------------------------------------------------------- #5 quota / runtime
test('#5 a 25-item batch does <= 3 ledger Sheets reads and ONE Tasks list read', () => {
  const ctx = makeHubContext({ realStores: true, features: LIVE, batchSize: 25 });
  for (let i = 0; i < 25; i += 1) addThread(ctx, { id: `t${i}`, labels: ['🎯/Task'], subject: `Subject ${i}` });
  ctx.__fakes.sheetsCalls.length = 0;
  const r = run(ctx);
  assert.equal(r.ok, true, JSON.stringify(r));
  const ledgerReads = ctx.__fakes.sheetsCalls.filter((c) => /values\.(get|batchGet)/.test(c.method) && /Integration Ledger/.test(JSON.stringify(c.range || c.ranges)));
  assert.ok(ledgerReads.length <= 3, `ledger reads: ${ledgerReads.length}`);
  assert.equal(ctx.__hub.tasks.items.length, 25);
  assert.ok(ctx.__hub.tasks.calls.filter((c) => c === 'tasks.list').length <= 1, 'Tasks list read once per run');
  assert.equal(ctx.DPLedgerRepo.list({ status: 'DONE' }).length, 25);
});

test('#5 elapsed-time guard: a slow clock stops the batch with no PENDING orphans, lock released, rest resumes', () => {
  const ctx = makeHubContext({ features: LIVE, batchSize: 25 });
  for (let i = 0; i < 25; i += 1) addThread(ctx, { id: `t${i}`, labels: ['🎯/Task'] });
  ctx.__hub.tasks.onInsert = () => { ctx.__nowMs += 90 * 1000; };
  const r1 = run(ctx);
  assert.equal(ctx.__hub.tasks.inserts, 3, 'stops starting items after 4 minutes');
  assert.equal(r1.done, false);
  assert.match(r1.message, /time/i);
  const rows = [...ctx.__hub.ledger.rows.values()];
  assert.equal(rows.length, 3, 'unprocessed items leave no ledger rows');
  assert.ok(rows.every((x) => x.Status === 'DONE'), 'no PENDING orphans');
  assert.equal(ctx.LockService.state.holder, null, 'script lock released');
  for (let i = 0; i < 12; i += 1) run(ctx);
  assert.equal(ctx.__hub.tasks.items.length, 25);
  assert.equal(new Set(ctx.__hub.tasks.items.map((x) => x.notes)).size, 25, 'no duplicates after resume');
});

// ---------------------------------------------------------------- #6 getOccurrence
test('#6 getOccurrence rejects an event that does not belong to the series (non-retryable) and accepts one that does', () => {
  const ctx = makeHubContext({ features: LIVE });
  addCoreOccurrences(ctx);
  ctx.__hub.calendar.events.push({ id: 'lunch1', summary: 'NCMMS - Daily Standup', start: '2026-10-06T19:00:00Z', end: '2026-10-06T19:15:00Z', recurringEventId: 'dailyRec' });
  const reg = ctx.__hub.config.registry;
  const core = reg.find((r) => r.SeriesKey === 'NCMMS_CORE');
  assert.equal(ctx.DPCalendarRepo.getOccurrence(core, 'core_20261006', reg).id, 'core_20261006');
  let err = null;
  try { ctx.DPCalendarRepo.getOccurrence(core, 'lunch1', reg); } catch (e) { err = e; }
  assert.ok(err, 'foreign occurrence must be rejected');
  assert.equal(err.retryable, false);
  assert.equal(err.code, 'OCCURRENCE_NOT_IN_SERIES');
});

test('#6 getOccurrence maps only HTTP 404 to non-retryable OCCURRENCE_NOT_FOUND; 5xx/quota stay retryable', () => {
  const ctx = makeHubContext({ features: LIVE });
  addCoreOccurrences(ctx);
  const reg = ctx.__hub.config.registry;
  const core = reg.find((r) => r.SeriesKey === 'NCMMS_CORE');
  const attempt = () => { try { ctx.DPCalendarRepo.getOccurrence(core, 'core_20261006', reg); return null; } catch (e) { return e; } };
  ctx.Calendar.Events.get = () => { throw Object.assign(new Error('Backend Error'), { code: 503 }); };
  let e = attempt();
  assert.ok(e && e.code !== 'OCCURRENCE_NOT_FOUND' && e.retryable !== false, `5xx: ${e && e.code}`);
  ctx.Calendar.Events.get = () => { throw new Error('API call to calendar.events.get failed with error: Rate Limit Exceeded'); };
  e = attempt();
  assert.ok(e && e.code !== 'OCCURRENCE_NOT_FOUND' && e.retryable !== false, 'quota');
  ctx.Calendar.Events.get = () => { throw Object.assign(new Error('Not Found'), { code: 404 }); };
  e = attempt();
  assert.equal(e.code, 'OCCURRENCE_NOT_FOUND');
  assert.equal(e.retryable, false);
});

// ---------------------------------------------------------------- #8 carry-in idempotency
test('#8 crash after the Doc write then cutoff rollover => still exactly one carry-in', () => {
  const ctx = makeHubContext({ features: { ...LIVE, NCMMS_CORE_PILOT: true }, now: '2026-10-05T22:00:00Z' });
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 't1', labels: ['🎯/Meeting/NCMMS-Core'], subject: 'Budget question' });
  ctx.__hub.ledger.failUpsert = (row) => row.Status !== 'PENDING'; // process dies before DONE/ERROR can be written
  run(ctx);
  const doc = () => ctx.__hub.notes.docs['doc-NCMMS_CORE-0000000000'];
  const count = (date) => toHost(ctx.DPEngines.carryInCount(doc(), { date, displayName: 'NCMMS Core Team' }));
  assert.equal(count('2026-10-06'), 1, 'Doc write happened');
  assert.equal(ctx.__hub.ledger.rows.get('GMAIL|t1|MEETING|core_20261006').Status, 'PENDING');
  ctx.__hub.ledger.failUpsert = null;
  ctx.__setNow('2026-10-06T14:45:00Z'); // past the 07:30 PT prep cutoff: selection now prefers 10-13
  run(ctx);
  assert.equal(count('2026-10-06'), 1);
  assert.equal(count('2026-10-13'), 0, 'no second carry-in on the next occurrence');
  const meetingKeys = [...ctx.__hub.ledger.rows.keys()].filter((k) => k.includes('MEETING'));
  assert.deepEqual(meetingKeys, ['GMAIL|t1|MEETING|core_20261006']);
  assert.equal(ctx.__hub.ledger.rows.get(meetingKeys[0]).Status, 'DONE');
});

// ---------------------------------------------------------------- #9 time zone seed
test('#9 TimeZone seed prefers the Calendar user setting, then the primary calendar, then the script zone', () => {
  const tz = (ctx) => {
    const id = ctx.DPConfig.ensureSetup();
    return ctx.__fakes.sheets[id].tabs.find((t) => t.title === 'Config').rows.find((r) => r[0] === 'TimeZone')[1];
  };
  let ctx = configCtx();
  ctx.Calendar = { Settings: { get: (n) => ({ id: n, value: 'Europe/Paris' }) }, Calendars: { get: () => ({ timeZone: 'Asia/Tokyo' }) } };
  assert.equal(tz(ctx), 'Europe/Paris');
  ctx = configCtx();
  ctx.Calendar = { Settings: { get: () => { throw new Error('denied'); } }, Calendars: { get: () => ({ timeZone: 'Asia/Tokyo' }) } };
  assert.equal(tz(ctx), 'Asia/Tokyo');
  ctx = configCtx();
  ctx.Calendar = {};
  assert.equal(tz(ctx), 'America/New_York');
});

// ---------------------------------------------------------------- #10 aiGuard
test('#10 aiGuard excludes HR labels (any case, _HR, HR/...) and honors configured ExcludedAiLabels', () => {
  const base = { seriesAiAllowed: true, featureFlag: true };
  for (const l of ['HR', 'hr', '_HR', '_hr', 'HR/Cases', 'Work/HR/Cases']) {
    assert.equal(isAiAllowed({ ...base, labels: [l] }), false, l);
  }
  for (const l of ['Archive', 'Chrome', 'Shrink/Notes']) {
    assert.equal(isAiAllowed({ ...base, labels: [l] }), true, l);
  }
  assert.equal(isAiAllowed({ ...base, labels: ['Legal/Matter7'], excludedLabels: ['Legal'] }), false);
  assert.equal(isAiAllowed({ ...base, labels: ['Legal/Matter7'], excludedLabels: [] }), true);
});

// ---------------------------------------------------------------- #11 Gmail repo
test('#11 an invalid Date header does not throw for the whole thread; URL is account-agnostic', () => {
  const ctx = makeHubContext({ features: LIVE });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'], messages: [{ from: 'Pat <pat@example.test>', subject: 'S' }, { from: 'Lee <lee@example.test>', subject: 'S' }] });
  const realGet = ctx.Gmail.Users.Threads.get;
  ctx.Gmail.Users.Threads.get = (u, id, o) => {
    const t = toHost(realGet(u, id, o));
    t.messages[0].payload.headers.find((h) => h.name === 'Date').value = 'not a date';
    delete t.messages[0].internalDate;
    t.messages[1].internalDate = 'garbage';
    return t;
  };
  const meta = ctx.DPGmailRepo.getThreadMeta('t1', null);
  assert.equal(meta.messages.length, 2);
  assert.equal(meta.messages[0].date, '');
  assert.equal(meta.url, 'https://mail.google.com/mail/#all/t1');
  assert.ok(!meta.url.includes('/u/0/'));
});

test('#11 internalDate wins; a valid Date header is the fallback', () => {
  const ctx = makeHubContext({ features: LIVE });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'], date: '2026-10-05T20:00:00Z' });
  const realGet = ctx.Gmail.Users.Threads.get;
  ctx.Gmail.Users.Threads.get = (u, id, o) => { const t = toHost(realGet(u, id, o)); delete t.messages[0].internalDate; return t; };
  assert.equal(ctx.DPGmailRepo.getThreadMeta('t1', null).messages[0].date, '2026-10-05T20:00:00.000Z');
});

// ---------------------------------------------------------------- #12 triggers
test('#12 LOCK_BUSY does not mark CORE_CARRYIN done for the day; the next tick retries', () => {
  const ctx = makeHubContext({ features: LIVE, now: '2026-10-06T14:21:00Z' }); // 07:21 PT
  const other = ctx.LockService.getScriptLock();
  assert.equal(other.tryLock(), true);
  ctx._hubDispatchInternal();
  assert.equal(userProps(ctx).getProperty('HUB_JOB_CORE_CARRYIN'), null);
  other.releaseLock();
  ctx.__setNow('2026-10-06T14:26:00Z');
  ctx._hubDispatchInternal();
  assert.equal(userProps(ctx).getProperty('HUB_JOB_CORE_CARRYIN'), '2026-10-06');
});

test('#12 TRIAGE_REFRESH counts from metadata only (never loads full bodies)', () => {
  const ctx = makeHubContext({ features: { ...LIVE, TRIAGE_BOARD: true }, now: '2026-10-06T19:01:00Z' }); // 12:01 PT
  for (let i = 0; i < 5; i += 1) addThread(ctx, { id: `v${i}`, labels: ['VIP'], subject: `VIP ${i}` });
  ctx._hubDispatchInternal();
  const calls = ctx.__hub.gmail.calls;
  assert.ok(calls.includes('threads.get:metadata'), calls.join(','));
  assert.ok(!calls.includes('threads.get:full'), 'full bodies must not be loaded just to count');
  const summary = JSON.parse(userProps(ctx).getProperty('HUB_JOB_SUMMARY'));
  assert.ok(summary.summary.jobs.TRIAGE_REFRESH.queues, JSON.stringify(summary));
});

// ---------------------------------------------------------------- #13 DRY_RUN last-run property
test('#13 DRY_RUN writes only HUB_LAST_RUN_DRY; a live run writes HUB_LAST_RUN', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true } });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  run(ctx);
  assert.equal(userProps(ctx).getProperty('HUB_LAST_RUN'), null);
  assert.ok(userProps(ctx).getProperty('HUB_LAST_RUN_DRY'));
  const live = makeHubContext({ features: LIVE });
  addThread(live, { id: 't1', labels: ['🎯/Task'] });
  run(live);
  assert.ok(userProps(live).getProperty('HUB_LAST_RUN'));
  assert.equal(userProps(live).getProperty('HUB_LAST_RUN_DRY'), null);
});

// ---------------------------------------------------------------- #14 ledger archive + seed tabs
function seedLedger(ctx, oldRows, newRows) {
  const id = ctx.DPConfig.ensureSetup();
  const tab = ctx.__fakes.sheets[id].tabs.find((t) => t.title === 'Integration Ledger');
  const cols = toHost(ctx.DPEngines.LEDGER_COLUMNS);
  const mk = (key, status, updated) => cols.map((c) => ({ OperationKey: key, SourceType: 'GMAIL', SourceId: 's', Status: status, CreatedAt: updated, UpdatedAt: updated })[c] || '');
  const recent = new Date().toISOString();
  for (let i = 0; i < oldRows; i += 1) tab.rows.push(mk(`OLD${i}`, 'DONE', '2025-01-01T00:00:00.000Z'));
  for (let i = 0; i < newRows; i += 1) tab.rows.push(mk(`NEW${i}`, i % 2 ? 'DONE' : 'PENDING', recent));
  return { id, tab, sheet: ctx.__fakes.sheets[id] };
}

test('#14 LEDGER_FULL archives DONE rows older than 90 days to the archive tab in one batch, then proceeds', () => {
  const ctx = configCtx();
  loadGasFile(ctx, 'LedgerRepository.gs');
  const { tab, sheet } = seedLedger(ctx, 4500, 500);
  const row = ctx.DPLedgerRepo.upsert({ OperationKey: 'FRESH', SourceType: 'GMAIL', SourceId: 'x', Status: 'PENDING' });
  assert.equal(row.OperationKey, 'FRESH');
  const live = tab.rows.slice(1).filter((r) => r.some((c) => c !== ''));
  assert.equal(live.length, 501);
  assert.ok(live.every((r) => !String(r[0]).startsWith('OLD')));
  const arch = sheet.tabs.find((t) => t.title === 'Integration Ledger Archive');
  assert.ok(arch, 'archive tab exists');
  assert.equal(arch.rows.slice(1).filter((r) => r.some((c) => c !== '')).length, 4500);
  assert.equal(ctx.DPLedgerRepo.get('NEW1').Status, 'DONE');
  assert.equal(ctx.DPLedgerRepo.get('OLD7'), null);
});

test('#14 LEDGER_FULL with nothing archivable still fails loud', () => {
  const ctx = configCtx();
  loadGasFile(ctx, 'LedgerRepository.gs');
  seedLedger(ctx, 0, 5000);
  assert.throws(() => ctx.DPLedgerRepo.upsert({ OperationKey: 'FRESH' }), /LEDGER_FULL/);
});

test('#14 seeded Sheet has Config, Meeting Registry, Integration Ledger, Integration Ledger Archive (no Triage Dismissals)', () => {
  const ctx = configCtx();
  const id = ctx.DPConfig.ensureSetup();
  const titles = toHost(ctx.__fakes.sheets[id].tabs.map((t) => t.title));
  assert.deepEqual(titles, ['Config', 'Meeting Registry', 'Integration Ledger', 'Integration Ledger Archive']);
  assert.deepEqual(toHost(ctx.__fakes.sheets[id].tabs[3].rows[0]), toHost(ctx.DPEngines.LEDGER_COLUMNS));
});
