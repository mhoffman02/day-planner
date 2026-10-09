/**
 * @file hubContractParity.test.js
 * @description Phase 28 integration guard: (a) every hub RPC the UI calls is exported by the server
 * (IIFE alias + Code.gs top-level delegator), (b) the client mock (src/hubMock.js) and the real
 * HubController (run in the vm with fakes) satisfy ONE shared shape checker, (c) the feature flag
 * names the UI relies on equal DPEngines.DEFAULT_FEATURES.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread, addCoreOccurrences } from './helpers/gasFakesHub.js';
import {
  checkEnvelope, checkHubStatus, checkTriageBoard, checkMeetingChoices, checkMeetingPrep, checkRouteResult
} from './helpers/hubShapes.js';
import { HubMock } from '../src/hubMock.js';
import { DEFAULT_FEATURES } from '../src/integration/contracts.js';
import { QUEUE_ORDER } from '../src/hubUi.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const FEATURE_KEYS = Object.keys(DEFAULT_FEATURES);
const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));

function rpcNames(src, re) {
  return [...new Set([...src.matchAll(re)].map((m) => m[1]))].sort();
}

test('(a) every hub RPC called by the UI or bridge has an IIFE alias and a Code.gs top-level delegator', () => {
  const script = read('gas-app/Script.html');
  const bridge = read('src/gasBridge.js');
  const fromScript = rpcNames(script, /hubRpc\('(\w+)'/g);
  const fromBridge = rpcNames(bridge, /_hubRpc\('(\w+)'/g);
  assert.ok(fromScript.length >= 9, `expected >= 9 hub RPCs in Script.html, got ${fromScript}`);
  assert.deepEqual(fromScript, fromBridge, 'Script.html and gasBridge.js call the same RPC set');
  const gasDir = path.join(root, 'gas-app');
  const gasSrc = fs.readdirSync(gasDir).filter((f) => f.endsWith('.gs')).map((f) => [f, read(`gas-app/${f}`)]);
  const code = read('gas-app/Code.gs');
  for (const name of fromScript) {
    const owners = gasSrc.filter(([f, s]) => f !== 'Code.gs' && new RegExp(`^global\\._${name}Internal = ${name};`, 'm').test(s));
    assert.equal(owners.length, 1, `${name}: IIFE alias global._${name}Internal in exactly one non-Code.gs file`);
    assert.equal((code.match(new RegExp(`^function ${name}\\(`, 'gm')) || []).length, 1, `${name}: top-level delegator in Code.gs`);
    assert.match(code, new RegExp(`_${name}Internal`), `${name}: delegator calls the alias`);
  }
  // Every bridge method the mock implements exists on the mock too.
  const mock = new HubMock();
  for (const name of fromBridge) assert.equal(typeof mock[name], 'function', `HubMock.${name}`);
});

test('(c) feature flag names used by the UI and the mock equal DPEngines.DEFAULT_FEATURES', () => {
  const ui = [...read('src/hubUi.js').matchAll(/flags\.([A-Z_]+)/g)].map((m) => m[1]);
  const mirror = [...read('gas-app/Script.html').matchAll(/flags\.([A-Z_]+)/g)].map((m) => m[1]);
  assert.ok(ui.length > 0);
  for (const f of new Set([...ui, ...mirror])) assert.ok(FEATURE_KEYS.includes(f), `UI flag ${f} is not a DEFAULT_FEATURES key`);
  assert.deepEqual(Object.keys(new HubMock().getHubStatus().flags).sort(), [...FEATURE_KEYS].sort());
  const real = makeHubContext({ features: { GMAIL_ROUTER: true } });
  assert.deepEqual(Object.keys(call(real, 'getHubStatus').flags).sort(), [...FEATURE_KEYS].sort());
  assert.deepEqual(Object.keys(toHost(real.DPEngines.DEFAULT_FEATURES)).sort(), [...FEATURE_KEYS].sort());
});

function assertShape(label, errs) {
  assert.deepEqual(errs, [], `${label}: ${errs.join('; ')}`);
}

// What the UI sends for a meeting route (see openMeetingPicker / confirmMeetingRoute).
function meetingOpts(choices) {
  const c = choices.choices.find((x) => !x.unavailable);
  return { seriesKey: c.seriesKey, occurrenceId: (c.recommended && c.recommended.occurrenceId) || c.upcoming[0].occurrenceId };
}

function runMockSide(dryRun) {
  const mock = new HubMock({ dryRun });
  const out = {};
  out.status = mock.getHubStatus();
  out.board = mock.getTriageBoard({});
  const threadId = out.board.queues.meetingCarryIns[0].threadId;
  out.choices = mock.getUpcomingMeetingChoices(threadId);
  const mo = meetingOpts(out.choices);
  out.prep = mock.getMeetingPrep('NCMMS_CORE', null);
  out.routes = [
    mock.routeThreadToTask('t-1001', { today: true, priority: 'A1' }),
    mock.routeThreadToWaiting('t-1002', { waitingOn: 'Pat', nagDate: '2026-10-12' }),
    mock.routeThreadToMeeting(threadId, mo.occurrenceId, { framing: 'Decision needed', seriesKey: mo.seriesKey }),
    mock.dismissTriageItem('t-4001'),
    mock.routeThreadToTask('t-1001', { today: true }) // repeat -> SKIPPED
  ];
  out.failures = [mock.routeThreadToTask('nope', {}), mock.retryFailedOperation('GMAIL|t-1001|TASK')];
  const off = new HubMock({ flags: { GMAIL_ROUTER: false } });
  out.flagOff = [off.getTriageBoard({}), off.getMeetingPrep('NCMMS_CORE', null)];
  return out;
}

function runRealSide(dryRun) {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true, NCMMS_CORE_PILOT: true, DRY_RUN: dryRun }, now: '2026-10-05T22:00:00Z' });
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 'a1', labels: ['00_AR', 'VIP'], subject: 'Approval needed', body: 'Please approve by Friday' });
  addThread(ctx, { id: 'a2', labels: ['🎯/Waiting'], subject: 'Waiting on vendor' });
  addThread(ctx, { id: 'm1', labels: ['🎯/Meeting/NCMMS-Core'], subject: 'Core item' });
  addThread(ctx, { id: 'f1', labels: ['FYI_Candidate'], subject: 'Newsletter', from: 'noreply@example.test', body: 'hello' });
  const out = {};
  out.status = call(ctx, 'getHubStatus');
  out.board = call(ctx, 'getTriageBoard', {});
  out.choices = call(ctx, 'getUpcomingMeetingChoices', 'm1');
  const mo = meetingOpts(out.choices);
  out.prep = call(ctx, 'getMeetingPrep', 'NCMMS_CORE', null);
  out.routes = [
    call(ctx, 'routeThreadToTask', 'a1', { today: true, priority: 'A1' }),
    call(ctx, 'routeThreadToWaiting', 'a2', { waitingOn: 'Pat', nagDate: '2026-10-12' }),
    call(ctx, 'routeThreadToMeeting', 'm1', mo.occurrenceId, { framing: 'Decision needed', seriesKey: mo.seriesKey }),
    call(ctx, 'dismissTriageItem', 'f1'),
    call(ctx, 'routeThreadToTask', 'a1', { today: true })
  ];
  out.failures = [call(ctx, 'routeThreadToTask', 'bad|id', {}), call(ctx, 'retryFailedOperation', 'GMAIL|a1|TASK')];
  const off = makeHubContext();
  out.flagOff = [call(off, 'getTriageBoard', {}), call(off, 'getMeetingPrep', 'NCMMS_CORE', null)];
  return out;
}

for (const dry of [true, false]) {
  for (const [side, run] of [['mock', runMockSide], ['real server', runRealSide]]) {
    test(`(b) ${side} outputs satisfy the shared shape checker (DRY_RUN ${dry})`, () => {
      const o = run(dry);
      assertShape('getHubStatus', checkHubStatus(o.status, FEATURE_KEYS));
      assertShape('getTriageBoard', checkTriageBoard(o.board));
      assert.ok(Object.values(o.board.queues).flat().length > 0, 'board has items');
      assertShape('getUpcomingMeetingChoices', checkMeetingChoices(o.choices));
      assert.ok(o.choices.choices.some((c) => !c.unavailable), 'at least one available destination');
      assertShape('getMeetingPrep', checkMeetingPrep(o.prep));
      assert.equal(o.status.dryRun, dry);
      o.routes.forEach((r, i) => {
        assertShape(`route[${i}]`, checkRouteResult(r));
        assert.equal(r.ok, true, `route[${i}] ${r.message}`);
        assert.equal(r.status, i === 4 ? (dry ? 'DRY_RUN' : 'SKIPPED') : (dry ? 'DRY_RUN' : 'DONE'), `route[${i}] status`);
      });
      o.failures.forEach((r, i) => { assertShape(`failure[${i}]`, checkEnvelope(r)); assert.equal(r.ok, false); });
      o.flagOff.forEach((r, i) => {
        assertShape(`flagOff[${i}]`, checkEnvelope(r));
        assert.equal(r.ok, false);
        assert.equal(r.errorCode, 'FLAG_OFF');
      });
    });
  }
}

test('(b) queue keys on the board are exactly the keys the UI renders', () => {
  const real = runRealSide(false).board;
  assert.deepEqual(Object.keys(real.queues).sort(), [...QUEUE_ORDER].sort());
  assert.deepEqual(Object.keys(runMockSide(false).board.queues).sort(), [...QUEUE_ORDER].sort());
});
