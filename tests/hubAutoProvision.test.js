/**
 * @file hubAutoProvision.test.js
 * @description User decision 2026-10-12: "IF hub sheet not present THEN create hub sheet and config it".
 * getHubStatus (called on app load) creates a missing Hub Config Sheet, seeds GMAIL_ROUTER + TRIAGE_BOARD
 * TRUE with DRY_RUN TRUE (trial mode), and installs the one hubDispatch trigger. A Sheet adopted from the
 * Day Planner folder keeps its own flags. About's "Set up hub" uses the same path.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext } from './helpers/gasFakesHub.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const SHEET = 'application/vnd.google-apps.spreadsheet';
const sheets = (ctx) => ctx.__fakes.driveFiles.filter((f) => f.mimeType === SHEET && f.trashed !== true);
const AUTO = { GMAIL_ROUTER: true, TRIAGE_BOARD: true, DRY_RUN: true, NCMMS_CORE_PILOT: false, GEMINI_DISCOVERY: false, GEMINI_RECONCILIATION: false, USAI_ASSIST: false };

test('app load with no Sheet creates one, seeds Triage-on trial flags and installs the schedule', () => {
  const ctx = makeHubContext({ realStores: 'cold' });
  const st = call(ctx, 'getHubStatus');
  assert.equal(st.ok, true, JSON.stringify(st));
  assert.deepEqual(st.flags, AUTO);
  assert.equal(st.dryRun, true);
  assert.equal(st.triggers, 1);
  assert.equal(sheets(ctx).length, 1);
  assert.deepEqual(toHost(ctx.DPConfig.getFeatures({ fresh: true })), AUTO, 'flags are in the Sheet, not just the cache');
});

test('a second app load creates nothing new (one Sheet, one trigger)', () => {
  const ctx = makeHubContext({ realStores: 'cold' });
  call(ctx, 'getHubStatus');
  const again = call(ctx, 'getHubStatus');
  assert.equal(again.ok, true);
  assert.equal(again.triggers, 1);
  assert.equal(sheets(ctx).length, 1);
});

test('app load before the Day Planner folder is bound creates nothing and still answers', () => {
  const ctx = makeHubContext({ realStores: 'cold' });
  ctx.PropertiesService.getUserProperties().deleteProperty('DAY_PLANNER_ROOT_FOLDER_ID');
  const st = call(ctx, 'getHubStatus');
  assert.equal(st.ok, true, JSON.stringify(st));
  assert.equal(st.flags.GMAIL_ROUTER, false);
  assert.equal(st.triggers, 0);
  assert.equal(sheets(ctx).length, 0);
});

test('an existing Sheet found in the folder is adopted with its own flags, not reseeded', () => {
  const ctx = makeHubContext({ realStores: true, features: { GMAIL_ROUTER: false, TRIAGE_BOARD: false, DRY_RUN: false } });
  ctx.PropertiesService.getUserProperties().deleteProperty('DP_HUB_SHEET_ID'); // id lost, file still in the folder
  ctx.PropertiesService.getUserProperties().deleteProperty('HUB_FLAGS_JSON');
  const st = call(ctx, 'getHubStatus');
  assert.equal(st.ok, true, JSON.stringify(st));
  assert.equal(sheets(ctx).length, 1, 'adopted, not duplicated');
  assert.equal(st.flags.GMAIL_ROUTER, false);
  assert.equal(st.flags.DRY_RUN, false);
});

test('app load re-creates a permanently deleted Sheet with the trial seed', () => {
  const ctx = makeHubContext({ realStores: true, features: { GMAIL_ROUTER: true, DRY_RUN: false } });
  const oldId = ctx.DPConfig.getSheetId();
  ctx.__fakes.driveFiles.splice(ctx.__fakes.driveFiles.findIndex((f) => f.id === oldId), 1);
  delete ctx.__fakes.sheets[oldId];
  const st = call(ctx, 'getHubStatus');
  assert.equal(st.ok, true, JSON.stringify(st));
  assert.deepEqual(st.flags, AUTO);
  assert.equal(sheets(ctx).length, 1);
  assert.notEqual(ctx.PropertiesService.getUserProperties().getProperty('DP_HUB_SHEET_ID'), oldId);
});

test('About "Set up hub" uses the same seed and installs the schedule', () => {
  const ctx = makeHubContext({ realStores: 'cold' });
  const r = call(ctx, 'setupHub');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(toHost(ctx.DPConfig.getFeatures({ fresh: true })), AUTO);
  assert.equal(ctx.__hub.triggers.length, 1);
});

test('a failed auto-create fails loud (logged, failed result) and leaves no half-set-up hub', () => {
  const ctx = makeHubContext({ realStores: 'cold' });
  ctx.Drive.Files.insert = () => { throw new Error('Sheets API has not been used in project 123 before or it is disabled'); };
  const st = call(ctx, 'getHubStatus');
  assert.equal(st.ok, false);
  assert.match(st.message, /disabled/);
  assert.equal(ctx.DPConfig.isProvisioned(), false);
  assert.equal(ctx.__hub.triggers.length, 0);
  assert.match(ctx.__consoleLines.join('\n'), /disabled/);
});
