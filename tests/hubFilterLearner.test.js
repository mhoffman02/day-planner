/**
 * @file hubFilterLearner.test.js
 * @description User 2026-10-16 (WORK): Suggest filters said "Gmail limit reached; run again" three times in a row,
 * because one call read ~500 threads (40 units each) against Gmail's 6,000 units per user per minute, and a rerun
 * started over. The user wants about 20 business days of mail sampled. The learner now runs as a one-minute
 * trigger: each tick spends at most 4,000 units, resumes where it stopped, and stores only header features.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread, runFilterLearner } from './helpers/gasFakesHub.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const EIGHT = ['🎯/Task', '🎯/Task-Today', '🎯/Waiting', '🎯/Meeting', '🎯/Meeting/NCMMS-Core', '🎯/Meeting/NCMMS-Daily', '🎯/Read', '🎯/Review'];
const learnTriggers = (ctx) => ctx.__hub.triggers.filter((t) => t.handler === 'hubFilterLearnTick').length;

function bigCtx(inbox = 300) {
  const ctx = makeHubContext({ realStores: true, features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true } });
  EIGHT.forEach((n) => ctx.__hub.gmail.labelId(n));
  for (let i = 1; i <= 6; i++) addThread(ctx, { id: `task${i}`, archived: true, labels: ['🎯/Task'], from: 'NCMMS <noreply@ncmms.gov>', subject: `Work order ${i} assigned`, body: `Private CANARY${i}QQ details` });
  for (let i = 1; i <= inbox; i++) addThread(ctx, { id: `in${i}`, labels: ['INBOX'], from: `Person ${i} <p${i}@agency${i % 40}.gov>`, subject: `Topic ${i}` });
  ctx.__hub.gmail.queryHits['from:(noreply@ncmms.gov)'] = ['task1', 'task2', 'task3', 'task4', 'task5', 'task6'];
  return ctx;
}

test('every tick, and the click itself, stays inside the per-minute budget; the job reads everything and finishes', () => {
  const ctx = bigCtx(500);
  const h = ctx.__hub;
  const perTick = [];
  let before = 0;
  h.beforeLearnTick = () => { perTick.push(h.gmail.units - before); before = h.gmail.units; };
  const st = runFilterLearner(ctx);
  perTick.push(h.gmail.units - before);
  assert.equal(st.status, 'OK', JSON.stringify(st));
  assert.ok(st.ticks >= 3, `paced over several minutes, took ${st.ticks}`);
  for (const u of perTick) assert.ok(u <= 4000, `tick spent ${u} units`);
  assert.equal(st.result.sampled, 506);
  assert.match(st.message, /from 506 emails/);
  assert.ok(ctx.Utilities.sleeps.length > 500, 'calls are paced');
  assert.equal(learnTriggers(ctx), 0, 'trigger removed when done');
});

test('the click lists mail and installs one trigger; a second click while running does not restart', () => {
  const ctx = bigCtx(200);
  const first = call(ctx, 'hubSuggestFilters');
  assert.equal(first.status, 'LEARNING');
  assert.equal(first.phase, 'read');
  assert.equal(first.total, 206);
  assert.equal(learnTriggers(ctx), 1);
  call(ctx, 'hubFilterLearnTick');
  const mid = call(ctx, 'hubFilterLearnStatus');
  assert.ok(mid.read > 0 && mid.read < 206, JSON.stringify(mid));
  const again = call(ctx, 'hubSuggestFilters');
  assert.equal(again.read, mid.read, 'not restarted');
  assert.equal(learnTriggers(ctx), 1);
  assert.equal(ctx.__hub.triggers.filter((t) => t.handler === 'hubDispatch').length, call(ctx, 'getHubStatus').triggers, 'hub trigger untouched');
});

test('a Gmail quota error in the middle of a tick is resumed by the next tick, nothing lost', () => {
  const ctx = bigCtx(200);
  const h = ctx.__hub;
  let tick = -1;
  h.beforeLearnTick = (n) => { tick = n; };
  let gets = 0;
  h.gmail.quotaOnMessages = () => tick === 0 && (gets += 1) === 30;
  const st = runFilterLearner(ctx);
  assert.equal(st.status, 'OK', JSON.stringify(st));
  assert.equal(st.result.sampled, 206);
  assert.match(ctx.__consoleLines.join('\n'), /stopping this minute at read \(Gmail quota\)/);
});

test('a cache eviction mid-job ends it loudly and removes the trigger', () => {
  const ctx = bigCtx(200);
  const h = ctx.__hub;
  h.beforeLearnTick = (n) => { if (n === 1) [...h.cache.store.keys()].filter((k) => /:s:0$/.test(k)).forEach((k) => h.cache.store.delete(k)); };
  const st = runFilterLearner(ctx);
  assert.equal(st.ok, false);
  assert.equal(st.errorCode, 'SAMPLE_EXPIRED');
  assert.match(st.message, /expired.*start again/);
  assert.equal(learnTriggers(ctx), 0);
});

test('an unexpected error stops the job with its message and removes the trigger', () => {
  const ctx = bigCtx(20);
  ctx.Gmail.Users.Messages.get = () => { throw new Error('Backend Error 500'); };
  const st = runFilterLearner(ctx);
  assert.equal(st.status, 'ERROR');
  assert.equal(st.errorCode, 'LEARN_FAILED');
  assert.match(st.message, /Backend Error 500/);
  assert.equal(learnTriggers(ctx), 0);
});

test('bodies are read only while learning: never in the cache, the saved job state, the Sheet, logs or results', () => {
  const ctx = bigCtx(40);
  const st = runFilterLearner(ctx);
  assert.equal(st.status, 'OK', JSON.stringify(st));
  assert.ok(ctx.__hub.gmail.calls.includes('messages.get:full'), 'bodies were read for learning');
  const props = JSON.stringify([...ctx.PropertiesService.getUserProperties().store.entries()]);
  assert.doesNotMatch(JSON.stringify([...ctx.__hub.cache.store.values()]), /CANARY/);
  assert.doesNotMatch(props, /CANARY/);
  assert.doesNotMatch(JSON.stringify(Object.values(ctx.__fakes.sheets)), /CANARY/);
  assert.doesNotMatch(ctx.__consoleLines.join('\n'), /CANARY/);
  assert.doesNotMatch(JSON.stringify(st), /CANARY/);
});

test('a second run within 6 hours reuses the mail sample: it re-learns and re-measures without re-reading', () => {
  const ctx = bigCtx(100);
  runFilterLearner(ctx);
  const h = ctx.__hub;
  const mark = h.gmail.calls.length;
  const st = runFilterLearner(ctx);
  assert.equal(st.status, 'OK', JSON.stringify(st));
  const calls = h.gmail.calls.slice(mark);
  assert.ok(!calls.includes('messages.list'), 'no listing');
  assert.ok(!calls.includes('messages.get:metadata'), 'no header reads');
  assert.equal(st.result.sampled, 106);
});

test('the done message says how many Gmail filters and 🎯 labels it found ("0 existing" on WORK)', () => {
  const ctx = bigCtx(10);
  ctx.__hub.gmail.filters.push({ id: 'X1', criteria: { from: 'a@b.gov' }, action: { addLabelIds: ['IMPORTANT'] } });
  const st = runFilterLearner(ctx);
  assert.match(st.message, /Gmail has 1 filters \(0 add a 🎯 label\) and 8 🎯 labels/);
});

test('the learner RPCs and trigger handler have IIFE aliases and top-level delegators', () => {
  const code = fs.readFileSync(new URL('../gas-app/Code.gs', import.meta.url), 'utf8');
  const hub = fs.readFileSync(new URL('../gas-app/HubController.gs', import.meta.url), 'utf8');
  for (const n of ['hubFilterLearnStatus', 'hubFilterLearnTick']) {
    assert.match(code, new RegExp(`^function ${n}\\(\\) \\{`, 'm'), n);
    assert.match(hub, new RegExp(`global\\._${n}Internal = ${n};`), n);
  }
  assert.match(hub, /HUB_LEARN_TRIGGER_ = 'hubFilterLearnTick'/);
});

test('a slow Gmail cannot stretch a tick past 50 s: the tick stops on time and the next one continues', () => {
  const ctx = bigCtx(300);
  const h = ctx.__hub;
  // Each paced call takes 1 s of fake time, so the unit budget alone would allow a 200 s tick.
  let clock = Date.now();
  ctx.Date.now = () => clock;
  const sleep = ctx.Utilities.sleep;
  ctx.Utilities.sleep = function (ms) { clock += 1000; return sleep.call(this, ms); };
  const perTick = [];
  let start = clock;
  h.beforeLearnTick = () => { perTick.push(clock - start); clock += 60000; start = clock; };
  const st = runFilterLearner(ctx);
  perTick.push(clock - start);
  assert.equal(st.status, 'OK', JSON.stringify(st));
  assert.equal(st.result.sampled, 306);
  for (const ms of perTick) assert.ok(ms <= 52000, `tick ran ${ms} ms`);
  assert.match(ctx.__consoleLines.join('\n'), /stopping this minute at read \(time\)/);
});

test('the progress message says about how many minutes are left, from the pace each tick actually reached', () => {
  const ctx = bigCtx(200);
  const first = call(ctx, 'hubSuggestFilters');
  // 206 emails at 200 per minute (4,000 units / 20) is 2 minutes, plus about 2 to learn and check the filters.
  assert.equal(first.message, 'Reading your mail: 0 of 206, about 4 minutes to go');
  assert.equal(first.etaMin, 4);
  call(ctx, 'hubFilterLearnTick');
  const mid = call(ctx, 'hubFilterLearnStatus');
  const left = Math.ceil((206 - mid.read) / mid.read) + 2;
  assert.equal(mid.message, `Reading your mail: ${mid.read} of 206, ${left <= 1 ? 'about a minute' : `about ${left} minutes`} to go`);
  const done = runFilterLearner(ctx);
  assert.equal(done.etaMin, undefined);
  assert.doesNotMatch(done.message, /to go/);
});
