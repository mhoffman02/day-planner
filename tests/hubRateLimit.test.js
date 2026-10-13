/**
 * @file hubRateLimit.test.js
 * @description Live WORK 2026-10-12: "Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per
 * minute per user'" from gmail.users.threads.list. A board build stops at the first quota error (no more Gmail
 * calls), keeps the rows scored so far, and returns RATE_LIMITED (retryable) with a plain message. The number of
 * Gmail calls per board is pinned so a later change cannot quietly raise it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread } from './helpers/gasFakesHub.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const rows = (b) => Object.values(b.queues || {}).flat();
const gets = (ctx) => ctx.__hub.gmail.calls.filter((c) => c.startsWith('threads.get')).length;

function setup(n = 5) {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true, DRY_RUN: true } });
  for (let i = 0; i < n; i += 1) addThread(ctx, { id: `t${i}`, labels: ['00_AR'], subject: `S${i}` });
  return ctx;
}

test('quota error on a thread read: stop reading, keep scored rows, RATE_LIMITED', () => {
  const ctx = setup(5);
  ctx.__hub.gmail.quotaAfterGets = 2;
  const b = call(ctx, 'getTriageBoard', {});
  assert.equal(b.ok, false);
  assert.equal(b.errorCode, 'RATE_LIMITED');
  assert.equal(b.retryable, true);
  assert.match(b.message, /Gmail is limiting requests/);
  assert.equal(rows(b).length, 2, 'rows scored before the quota error are kept');
  assert.equal(gets(ctx), 3, 'no Gmail reads after the first quota error');
});

test('quota error on the label listing: no thread reads, RATE_LIMITED', () => {
  const ctx = setup(3);
  ctx.__hub.gmail.quotaOnList = true;
  const b = call(ctx, 'getTriageBoard', {});
  assert.equal(b.errorCode, 'RATE_LIMITED');
  assert.equal(ctx.__hub.gmail.calls.filter((c) => c === 'threads.list').length, 1);
  assert.equal(gets(ctx), 0);
});

test('Gmail calls per board are pinned: 6 label lists plus one read per thread', () => {
  const ctx = setup(5);
  ['FYI_Candidate', 'VIP', '🎯/Review', '🎯/Meeting', '🎯/Read'].forEach((n) => ctx.__hub.gmail.labelId(n));
  const b = call(ctx, 'getTriageBoard', {});
  assert.equal(b.ok, true);
  assert.equal(ctx.__hub.gmail.calls.filter((c) => c === 'threads.list').length, 6);
  assert.equal(gets(ctx), 5);
});
