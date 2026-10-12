/**
 * @file hubSheetLink.test.js
 * @description getHubSheetLink / setupHub RPCs behind About's "Open Hub Config Sheet" link. The link lookup
 * runs every time About opens, so it must never provision the Sheet; setupHub is the explicit create.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext } from './helpers/gasFakesHub.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const sheetCount = (ctx) => Object.keys(ctx.__fakes.sheets).length;

test('getHubSheetLink on an unprovisioned hub reports not set up and creates nothing', () => {
  const ctx = makeHubContext({ realStores: 'cold' });
  const r = call(ctx, 'getHubSheetLink');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.provisioned, false);
  assert.equal(r.url, null);
  assert.equal(r.missing, 'never');
  assert.equal(sheetCount(ctx), 0);
  assert.equal(ctx.DPConfig.isProvisioned(), false);
});

test('getHubSheetLink on a provisioned hub links straight to the Config tab', () => {
  const ctx = makeHubContext({ realStores: true });
  const id = ctx.DPConfig.getSheetId();
  const gid = ctx.__fakes.sheets[id].tabs.find((t) => t.title === 'Config').sheetId;
  const r = call(ctx, 'getHubSheetLink');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.provisioned, true);
  assert.equal(r.url, `https://docs.google.com/spreadsheets/d/${id}/edit#gid=${gid}`);
});

test('setupHub creates the Sheet once and returns its link; rerun reuses it', () => {
  const ctx = makeHubContext({ realStores: 'cold' });
  const r = call(ctx, 'setupHub');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.provisioned, true);
  assert.match(r.url, /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/edit#gid=\d+$/);
  assert.equal(sheetCount(ctx), 1);
  assert.equal(call(ctx, 'setupHub').url, r.url);
  assert.equal(sheetCount(ctx), 1);
});

// Users delete things: a trashed or permanently deleted Sheet must surface as "missing" with a re-create path,
// not as a dead link or an error that Try again can never clear.
const liveSheets = (ctx) => ctx.__fakes.driveFiles.filter((f) => f.mimeType === 'application/vnd.google-apps.spreadsheet' && f.trashed !== true);
function loseSheet(ctx, how) {
  const id = ctx.DPConfig.getSheetId();
  const i = ctx.__fakes.driveFiles.findIndex((f) => f.id === id);
  if (how === 'trashed') ctx.__fakes.driveFiles[i].trashed = true;
  else { ctx.__fakes.driveFiles.splice(i, 1); delete ctx.__fakes.sheets[id]; }
  return id;
}

for (const how of ['trashed', 'deleted']) {
  test(`getHubSheetLink reports a ${how} Sheet as missing (no dead link) and stays read-only`, () => {
    const ctx = makeHubContext({ realStores: true });
    const oldId = loseSheet(ctx, how);
    const r = call(ctx, 'getHubSheetLink');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.provisioned, false);
    assert.equal(r.url, null);
    assert.equal(r.missing, how);
    assert.equal(liveSheets(ctx).length, 0, 'lookup must not create a Sheet');
    assert.equal(ctx.PropertiesService.getUserProperties().getProperty('DP_HUB_SHEET_ID'), oldId, 'lookup must not rewrite properties');
  });

  test(`setupHub re-creates a ${how} Sheet and stores the new id`, () => {
    const ctx = makeHubContext({ realStores: true });
    const oldId = loseSheet(ctx, how);
    const r = call(ctx, 'setupHub');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.provisioned, true);
    const newId = ctx.PropertiesService.getUserProperties().getProperty('DP_HUB_SHEET_ID');
    assert.notEqual(newId, oldId);
    assert.equal(r.url, `https://docs.google.com/spreadsheets/d/${newId}/edit#gid=0`);
    assert.equal(liveSheets(ctx).length, 1);
    assert.equal(call(ctx, 'getHubSheetLink').url, r.url);
  });
}

test('getHubSheetLink fails loud when Drive errors for a reason other than not-found', () => {
  const ctx = makeHubContext({ realStores: true });
  ctx.Drive.Files.get = () => { const e = new Error('Service invoked too many times'); e.code = 429; throw e; };
  const r = call(ctx, 'getHubSheetLink');
  assert.equal(r.ok, false);
  assert.match(r.message, /too many times/);
});

test('setupHub without a bound Day Planner folder fails loud with a setup error', () => {
  const ctx = makeHubContext({ realStores: 'cold' });
  ctx.PropertiesService.getUserProperties().deleteProperty('DAY_PLANNER_ROOT_FOLDER_ID');
  const r = call(ctx, 'setupHub');
  assert.equal(r.ok, false);
  assert.match(r.message, /DAY_PLANNER_ROOT_FOLDER_ID|folder/i);
  assert.equal(sheetCount(ctx), 0);
});

test('HubMock link/setup match the real result keys, and setupHub flips an unprovisioned mock', async () => {
  const { HubMock } = await import('../src/hubMock.js');
  const real = call(makeHubContext({ realStores: true }), 'getHubSheetLink');
  const mock = new HubMock({ sheetProvisioned: false });
  const before = mock.getHubSheetLink();
  assert.deepEqual(Object.keys(before).sort(), Object.keys(real).sort());
  assert.equal(before.provisioned, false);
  assert.equal(before.url, null);
  const after = mock.setupHub();
  assert.equal(after.provisioned, true);
  assert.match(after.url, /#gid=\d+$/);
});

test('getHubSheetLink and setupHub have top-level google.script.run delegators in Code.gs', async () => {
  const { readFileSync } = await import('node:fs');
  const code = readFileSync(new URL('../gas-app/Code.gs', import.meta.url), 'utf8');
  for (const fn of ['getHubSheetLink', 'setupHub']) {
    assert.match(code, new RegExp(`^function ${fn}\\(\\)`, 'm'), `${fn} delegator missing`);
  }
});
