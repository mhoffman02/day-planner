/**
 * @file hubModeGuard.test.js
 * @description Stale-mode guard on Triage writes. The client sends expectDryRun (the mode it is showing);
 * when that differs from the flags the server will act on, the RPC refuses with MODE_CHANGED and writes
 * nothing. Stops a user reading "Trial mode" from archiving real mail after DRY_RUN was flipped elsewhere.
 * Callers that omit expectDryRun (gas-rpc, IDE) are not guarded.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread } from './helpers/gasFakesHub.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const writes = (ctx) => ctx.__hub.gmail.calls.filter((c) => /^threads\.(modify|trash)/.test(c));

function setup(dryRun) {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true, DRY_RUN: dryRun } });
  addThread(ctx, { id: 'a1', labels: ['INBOX', '00_AR', '🎯/Task'], subject: 'Approval needed' });
  return ctx;
}

const RPCS = [
  ['archiveTriageThread', (ctx, o) => call(ctx, 'archiveTriageThread', 'a1', o)],
  ['trashTriageThread', (ctx, o) => call(ctx, 'trashTriageThread', 'a1', o)],
  ['dismissTriageItem', (ctx, o) => call(ctx, 'dismissTriageItem', 'a1', o)],
  ['routeThreadToTask', (ctx, o) => call(ctx, 'routeThreadToTask', 'a1', { today: true, ...o })],
  ['routeThreadToWaiting', (ctx, o) => call(ctx, 'routeThreadToWaiting', 'a1', { waitingOn: 'Pat', ...o })]
];

for (const [name, run] of RPCS) {
  test(`${name}: screen shows trial but the hub is live -> MODE_CHANGED, nothing written`, () => {
    const ctx = setup(false);
    const r = run(ctx, { expectDryRun: true });
    assert.equal(r.ok, false, JSON.stringify(r));
    assert.equal(r.errorCode, 'MODE_CHANGED');
    assert.match(r.message, /Refresh/);
    assert.deepEqual(writes(ctx), []);
    assert.equal(ctx.__hub.ledger.rows.size, 0);
    assert.equal(ctx.__hub.tasks.inserts, 0);
  });

  test(`${name}: screen shows live but the hub is in trial -> MODE_CHANGED`, () => {
    const ctx = setup(true);
    const r = run(ctx, { expectDryRun: false });
    assert.equal(r.errorCode, 'MODE_CHANGED', JSON.stringify(r));
  });

  test(`${name}: matching mode proceeds`, () => {
    const ctx = setup(true);
    const r = run(ctx, { expectDryRun: true });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.status, 'DRY_RUN');
  });
}

test('Code.gs top-level delegators forward options (google.script.run calls the delegator, not the alias)', () => {
  const src = fs.readFileSync(new URL('../gas-app/Code.gs', import.meta.url), 'utf8');
  for (const name of ['dismissTriageItem', 'archiveTriageThread', 'trashTriageThread', 'routeThreadToTask', 'routeThreadToWaiting']) {
    const m = src.match(new RegExp(`^function ${name}\\(([^)]*)\\) \\{\\n(.*)$`, 'm'));
    assert.ok(m, `${name} delegator missing`);
    assert.match(m[1], /options/, `${name} delegator drops options`);
    assert.equal((m[2].match(/Internal\([^)]*options\)/g) || []).length, 2, `${name} delegator must pass options on both paths`);
  }
});

test('archiveTriageThread without expectDryRun (gas-rpc, IDE) is not guarded', () => {
  const ctx = setup(false);
  const r = call(ctx, 'archiveTriageThread', 'a1');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.status, 'DONE');
});
