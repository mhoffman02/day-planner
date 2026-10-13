/**
 * @file hubSafety.test.js
 * @description Exit criteria (k) export surface, (l) read-only Gmail / no body leakage, (m) single
 * dispatcher trigger, plus the triage/prep/status/Gemini-stub RPC contracts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toHost, loadGasFile } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread, addCoreOccurrences, lines } from './helpers/gasFakesHub.js';

const gasDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'gas-app');
const gasFiles = fs.readdirSync(gasDir).filter((f) => f.endsWith('.gs'));
const source = Object.fromEntries(gasFiles.map((f) => [f, fs.readFileSync(path.join(gasDir, f), 'utf8')]));
const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));

const RPC_NAMES = ['getTriageBoard', 'getMeetingPrep', 'getUpcomingMeetingChoices', 'routeThreadToTask', 'routeThreadToWaiting', 'routeThreadToMeeting',
  'dismissTriageItem', 'processWorkflowQueue', 'discoverMeetingSeries', 'retryFailedOperation', 'getHubStatus', 'discoverGeminiNotes',
  'getProposedMeetingActions', 'confirmMeetingActions', 'installHubTriggers', 'removeHubTriggers', 'hubDispatch', 'hubSetFeature', 'archiveTriageThread', 'trashTriageThread',
  'getHubSheetLink', 'setupHub'];

test('(k) every hub RPC has one implementation, one Code.gs top-level delegator, and an IIFE alias', () => {
  for (const name of RPC_NAMES) {
    const total = gasFiles.reduce((n, f) => n + (source[f].match(new RegExp(`^function ${name}\\(`, 'gm')) || []).length, 0);
    assert.equal(total, 2, `${name}: expected 2 top-level-anchored declarations across gas-app, got ${total}`);
    assert.equal((source['Code.gs'].match(new RegExp(`^function ${name}\\(`, 'gm')) || []).length, 1, `${name} delegator in Code.gs`);
    const owner = gasFiles.filter((f) => f !== 'Code.gs' && new RegExp(`^function ${name}\\(`, 'm').test(source[f]));
    assert.equal(owner.length, 1, `${name} owner file`);
    assert.match(source[owner[0]], new RegExp(`^global\\._${name}Internal = ${name};`, 'm'), `${name} alias`);
    assert.match(source['Code.gs'], new RegExp(`_${name}Internal\\(`), `${name} delegator calls the alias`);
  }
});

test('(k) hub .gs files are IIFE-wrapped with literal-only top-level initializers', () => {
  for (const f of ['GmailRepository.gs', 'CalendarRepository.gs', 'TaskRepository.gs', 'QueueProcessor.gs', 'HubController.gs', 'Triggers.gs']) {
    assert.match(source[f], /^\(function\(global\) \{$/m, f);
    assert.match(source[f], /^\}\)\(typeof globalThis !== 'undefined' \? globalThis : this\);\s*$/m, f);
    const body = source[f].split('\n').filter((l) => /^(var|let|const) \w+ = /.test(l));
    for (const l of body) {
      const rhs = l.split('=').slice(1).join('=').replace(/'[^']*'/g, "''");
      assert.ok(!/(Service|Session|Utilities|Cache|DP\w+|\w+\(|new )/.test(rhs), `${f}: non-literal initializer: ${l}`);
    }
  }
});

// The only Gmail writes allowed are the Triage Archive/Delete pair (gmail.modify, 2026-10-12), both in
// GmailRepository.gs: archive removes INBOX and nothing else; delete is Trash, never permanent.
const ALLOWED_GMAIL_WRITES = [
  "Gmail.Users.Threads.modify({ removeLabelIds: ['INBOX'] }, GMAIL_ME_, validateThreadId(threadId))",
  'Gmail.Users.Threads.trash(GMAIL_ME_, validateThreadId(threadId))'
];
test('(l) no GmailApp anywhere and no Gmail write calls beyond the two Triage buttons', () => {
  const WRITE_RE = /Gmail\.Users\.[\w.]*\.(modify|send|trash|untrash|batchModify|insert|import|delete|patch|update|create)\b/g;
  for (const f of gasFiles) {
    assert.ok(!/GmailApp/.test(source[f]), `${f} mentions the banned built-in mail service`);
    let rest = source[f];
    if (f === 'GmailRepository.gs') {
      for (const ok of ALLOWED_GMAIL_WRITES) {
        assert.equal(rest.split(ok).length, 2, `GmailRepository.gs must contain exactly one: ${ok}`);
        rest = rest.replace(ok, '');
      }
    }
    assert.deepEqual(rest.match(WRITE_RE) || [], [], `${f} calls a Gmail write method outside the allowed pair`);
  }
  assert.ok(!/format:\s*'(raw|minimal)'/.test(source['GmailRepository.gs']));
});

test('(l) message bodies never reach logs, properties, ledger, Tasks, Docs or RPC returns', () => {
  const CANARY = 'CANARY_BODY_7f3a91';
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true, NCMMS_CORE_PILOT: true, DRY_RUN: false } });
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 't1', labels: ['🎯/Task', '00_AR'], subject: 'Plain subject', body: `Please review by Friday ${CANARY}` });
  addThread(ctx, { id: 't2', labels: ['🎯/Meeting/NCMMS-Core'], subject: 'Core item', body: `Body ${CANARY}` });
  addThread(ctx, { id: 't3', labels: ['🎯/Task'], subject: 'Fails', body: CANARY });
  ctx.__hub.tasks.onInsert = (res) => { if (res.title === 'Fails') throw new Error('backend exploded'); };
  const outputs = [call(ctx, 'getTriageBoard', {}), call(ctx, 'processWorkflowQueue'), call(ctx, 'getHubStatus'), call(ctx, 'getUpcomingMeetingChoices', 't2'), call(ctx, 'getMeetingPrep', 'NCMMS_CORE', null)];
  const props = JSON.stringify(ctx.PropertiesService.getUserProperties().getProperties());
  const haystack = JSON.stringify([outputs, lines(ctx), props, [...ctx.__hub.ledger.rows.values()], ctx.__hub.tasks.items, ctx.__hub.notes.docs]);
  assert.ok(!haystack.includes(CANARY), 'a message body leaked');
  assert.ok(ctx.__hub.gmail.calls.some((c) => c === 'threads.get:full'), 'triage did read bodies in memory');
});

test('(m) installHubTriggers twice leaves exactly one hubDispatch trigger; sync trigger survives; remove is scoped', () => {
  const ctx = makeHubContext();
  ctx.__hub.triggers.push({ id: 'sync1', handler: 'syncWorkspaceChanges', minutes: 5 });
  assert.equal(call(ctx, 'installHubTriggers').ok, true);
  assert.equal(call(ctx, 'installHubTriggers').ok, true);
  const hubs = ctx.__hub.triggers.filter((t) => t.handler === 'hubDispatch');
  assert.equal(hubs.length, 1);
  assert.equal(hubs[0].minutes, 10);
  assert.equal(ctx.__hub.triggers.filter((t) => t.handler === 'syncWorkspaceChanges').length, 1);
  assert.equal(call(ctx, 'removeHubTriggers').removed, 1);
  assert.deepEqual(ctx.__hub.triggers.map((t) => t.handler), ['syncWorkspaceChanges']);
  ctx.__hub.config.triggerMinutes = 7;
  assert.throws(() => ctx._installHubTriggersInternal(), /TriggerMinutes must be one of/);
});

test('refresh jobs run once per local day inside their window (dueJobs)', () => {
  const ctx = makeHubContext();
  const sched = { DAILY_REFRESH: '06:55', CORE_CARRYIN: '07:20' };
  const due = (hm, last) => toHost(ctx.DPTriggers.dueJobs(hm, '2026-10-06', sched, 10, last));
  assert.deepEqual(due('06:50', {}), []);
  assert.deepEqual(due('06:58', {}), ['DAILY_REFRESH']);
  assert.deepEqual(due('06:58', { DAILY_REFRESH: '2026-10-06' }), []);
  assert.deepEqual(due('07:21', { DAILY_REFRESH: '2026-10-06' }), ['CORE_CARRYIN']);
  assert.deepEqual(due('09:00', {}), []);
});

test('hubDispatch with the router on runs the bounded queue and a due job', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, DRY_RUN: false }, now: '2026-10-06T14:00:00Z' });
  addThread(ctx, { id: 't1', labels: ['🎯/Task'] });
  const r = toHost(ctx._hubDispatchInternal());
  assert.equal(r.ok, true);
  assert.equal(ctx.__hub.tasks.items.length, 1);
  assert.ok(r.summary.jobs.EOD_RECONCILE === undefined);
});

test('RPCs reject bad input and gate on flags without touching Google services', () => {
  const ctx = makeHubContext();
  assert.equal(call(ctx, 'routeThreadToTask', 't1', {}).errorCode, 'FLAG_OFF');
  assert.equal(call(ctx, 'getTriageBoard', {}).message, 'GMAIL_ROUTER flag is off');
  const on = makeHubContext({ features: { GMAIL_ROUTER: true, DRY_RUN: false } });
  assert.equal(call(on, 'routeThreadToTask', 'bad|id', {}).errorCode, 'INVALID_THREAD_ID');
  assert.equal(call(on, 'routeThreadToTask', 'missing1', {}).errorCode, 'THREAD_NOT_FOUND');
  assert.equal(call(on, 'routeThreadToMeeting', 't1', null, {}).errorCode, 'INVALID_INPUT');
  assert.equal(call(on, 'retryFailedOperation', 'nonsense').ok, false);
  assert.equal(on.__hub.tasks.inserts, 0);
});

test('Gemini RPCs are stubs: ok:false with flag-off message', () => {
  const ctx = makeHubContext();
  for (const [name, flag, args] of [['discoverGeminiNotes', 'GEMINI_DISCOVERY', ['evt1']], ['getProposedMeetingActions', 'GEMINI_RECONCILIATION', ['evt1']], ['confirmMeetingActions', 'GEMINI_RECONCILIATION', ['evt1', []]]]) {
    const r = call(ctx, name, ...args);
    assert.equal(r.ok, false);
    assert.equal(r.message, `${flag} flag off`);
  }
});

test('getTriageBoard: queues, operationKey null without a ledger row, ERROR rows expose their key, dismiss removes', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true, DRY_RUN: false } });
  addThread(ctx, { id: 't1', labels: ['00_AR', 'VIP'], subject: 'Need approval', body: 'Please approve by Friday' });
  addThread(ctx, { id: 't2', labels: ['FYI_Candidate'], subject: 'Newsletter', from: 'noreply@example.test', body: 'hello' });
  const board = call(ctx, 'getTriageBoard', {});
  assert.equal(board.ok, true, board.message);
  const all = Object.values(board.queues).flat();
  assert.equal(all.length, 2);
  assert.ok(all.every((i) => i.operationKey === null));
  assert.ok(all.every((i) => !('bodyText' in i)));
  ctx.__hub.ledger.rows.set('GMAIL|t1|TASK', { OperationKey: 'GMAIL|t1|TASK', SourceType: 'GMAIL', SourceId: 't1', Status: 'ERROR', ErrorMessage: 'x', UpdatedAt: '2026-10-05T00:00:00.000Z' });
  const again = Object.values(call(ctx, 'getTriageBoard', {}).queues).flat().find((i) => i.threadId === 't1');
  assert.equal(again.operationKey, 'GMAIL|t1|TASK');
  assert.equal(again.ledgerStatus, 'ERROR');
  assert.equal(call(ctx, 'dismissTriageItem', 't2').ok, true);
  assert.equal(Object.values(call(ctx, 'getTriageBoard', {}).queues).flat().some((i) => i.threadId === 't2'), false);
});

test('getHubStatus shape; getMeetingPrep(seriesKey, null) resolves the recommended occurrence with carry-in count', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, NCMMS_CORE_PILOT: true, DRY_RUN: false } });
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 't1', labels: ['🎯/Meeting/NCMMS-Core'] });
  ctx._processWorkflowQueueInternal();
  const status = call(ctx, 'getHubStatus');
  assert.equal(status.ok, true);
  assert.equal(status.flags.GMAIL_ROUTER, true);
  assert.equal(status.dryRun, false);
  assert.equal(status.lastRun.counts.processed, 1);
  assert.equal(status.counts.DONE, 1);
  const prep = call(ctx, 'getMeetingPrep', 'NCMMS_CORE', null);
  assert.equal(prep.ok, true, prep.message);
  assert.equal(prep.occurrence.occurrenceId, 'core_20261006');
  assert.equal(prep.carryInCount, 1);
  assert.ok(prep.upcoming.length >= 1);
  const choices = call(ctx, 'getUpcomingMeetingChoices', 't1');
  assert.equal(choices.choices[0].seriesKey, 'NCMMS_CORE');
  assert.equal(choices.choices[0].recommended.occurrenceId, 'core_20261006');
});

test('discoverMeetingSeries finds the recurring id and reports the missing registry writer instead of hiding it', () => {
  const ctx = makeHubContext({ features: { DRY_RUN: false } });
  addCoreOccurrences(ctx);
  const r = call(ctx, 'discoverMeetingSeries');
  assert.equal(r.ok, true);
  assert.deepEqual(r.discovered.map((d) => [d.seriesKey, d.recurringEventId]), [['NCMMS_CORE', 'coreRec']]);
  assert.equal(r.persisted, false);
  assert.match(r.message, /RecurringEventId not saved/);
  const saved = [];
  ctx.DPConfig = { ...ctx.DPConfig, updateRegistryRows: (us) => us.forEach((u) => saved.push([u.seriesKey, u.fields])) };
  assert.equal(call(ctx, 'discoverMeetingSeries').persisted, true);
  assert.deepEqual(toHost(saved), [['NCMMS_CORE', { RecurringEventId: 'coreRec', CalendarId: 'primary' }]]);
});

test('discoverMeetingSeries persists RecurringEventId and CalendarId through the real DPConfig registry writer', () => {
  const ctx = makeHubContext({ features: { DRY_RUN: false } });
  addCoreOccurrences(ctx);
  loadGasFile(ctx, 'Config.gs');
  ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', 'FOLDER1');
  ctx.DPConfig.ensureSetup();
  ctx.DPConfig.setFeature('DRY_RUN', false);
  const r = call(ctx, 'discoverMeetingSeries');
  assert.equal(r.ok, true, r.message);
  assert.equal(r.persisted, true);
  const core = toHost(ctx.DPConfig.getRegistry()).find((x) => x.SeriesKey === 'NCMMS_CORE');
  assert.equal(core.RecurringEventId, 'coreRec');
  assert.equal(core.CalendarId, 'primary');
});
