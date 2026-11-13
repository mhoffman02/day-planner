/**
 * @file driveRegrant.test.js
 * @description Picker re-grant page (?view=regrant). Linking HOME to GCP day-planner-507615 dropped the
 * drive.file write grants on files created under the old default project (probe 2026-10-10: folder, hub
 * Sheet, Run Log, every monthly Notes Doc). Picking a file in Google Picker with setAppId(<project number>)
 * grants the app write access again. getDriveRegrantConfig hands the page what Picker needs; the API key
 * lives only in Script Properties (public repo).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeGasContext, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';

const REGRANT_HTML = fs.readFileSync(path.join(import.meta.dirname, '..', 'gas-app', 'Regrant.html'), 'utf8');

const IN_ONE_HOUR = () => String(Date.now() + 3600000);

function regrantCtx({ apiKey = 'k-123', folderId = 'folder1', regrantUntil = IN_ONE_HOUR() } = {}) {
  const ctx = makeGasContext();
  if (apiKey) ctx.PropertiesService.getScriptProperties().setProperty('PICKER_API_KEY', apiKey);
  if (regrantUntil !== null) ctx.PropertiesService.getScriptProperties().setProperty('REGRANT_ENABLED_UNTIL', regrantUntil);
  if (folderId) ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', folderId);
  ctx.tokenReads = 0;
  ctx.ScriptApp = { getOAuthToken: () => { ctx.tokenReads++; return 'tok-abc'; } };
  ctx.console.info = ctx.console.log; // doGet logs its request with console.info
  const rendered = [];
  const output = {
    setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; }, setFaviconUrl() { return this; }
  };
  ctx.HtmlService = {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createTemplateFromFile: (name) => { rendered.push(name); return { evaluate: () => output }; }
  };
  loadGasFile(ctx, 'Code.gs');
  return { ctx, rendered };
}

test('getDriveRegrantConfig returns token, key, project-number appId and folder id', () => {
  const { ctx } = regrantCtx();
  assert.deepEqual(toHost(ctx.getDriveRegrantConfig()), { token: 'tok-abc', apiKey: 'k-123', appId: '951958469609', folderId: 'folder1' });
});

// The config carries the live OAuth token, so it is refused unless the owner opened a window by
// hand: Script Property REGRANT_ENABLED_UNTIL = a future epoch-ms. Fail closed on anything else.
for (const [label, regrantUntil] of [
  ['unset', null],
  ['expired', String(Date.now() - 1000)],
  ['not a number', 'yes'],
  ['empty', ''],
  ['negative', '-5'],
  ['fractional junk', '1e99']
]) {
  test(`REGRANT_ENABLED_UNTIL ${label}: refuses before reading the OAuth token, says how to enable`, () => {
    const { ctx } = regrantCtx({ regrantUntil });
    assert.throws(() => ctx.getDriveRegrantConfig(), (err) => {
      assert.match(err.message, /Drive re-grant is disabled/);
      assert.match(err.message, /Project Settings > Script Properties/);
      assert.match(err.message, /REGRANT_ENABLED_UNTIL to \d{13}/);
      return true;
    });
    assert.equal(ctx.tokenReads, 0, 'token must not be read when the gate is closed');
  });
}

test('REGRANT_ENABLED_UNTIL in the future: token is served (gate open)', () => {
  const { ctx } = regrantCtx({ regrantUntil: String(Date.now() + 60000) });
  assert.equal(toHost(ctx.getDriveRegrantConfig()).token, 'tok-abc');
  assert.equal(ctx.tokenReads, 1);
});

// A far-future window (e.g. 9999999999999) would leave the token gate open indefinitely: cap at 24h.
const DAY_MS = 24 * 3600000;
for (const [label, aheadMs] of [['25h ahead', DAY_MS + 3600000], ['far future', 9e12]]) {
  test(`REGRANT_ENABLED_UNTIL ${label}: refuses (window over 24h), says to set at most 24h ahead`, () => {
    const { ctx } = regrantCtx({ regrantUntil: String(Date.now() + aheadMs) });
    assert.throws(() => ctx.getDriveRegrantConfig(), (err) => {
      assert.match(err.message, /more than 24h ahead/);
      assert.match(err.message, /at most 24h ahead/);
      assert.match(err.message, /REGRANT_ENABLED_UNTIL to \d{13}/);
      return true;
    });
    assert.equal(ctx.tokenReads, 0, 'token must not be read when the window is too long');
  });
}

test('REGRANT_ENABLED_UNTIL just under 24h ahead: gate open', () => {
  const { ctx } = regrantCtx({ regrantUntil: String(Date.now() + DAY_MS - 60000) });
  assert.equal(toHost(ctx.getDriveRegrantConfig()).token, 'tok-abc');
});

test('Regrant page shows the server refusal text to the owner', () => {
  assert.match(REGRANT_HTML, /callServer\('getDriveRegrantConfig'\)[\s\S]*?\.catch\(function\(err\) \{ fail\('Setup failed', err\); \}\)/);
  assert.match(REGRANT_HTML, /setStatus\(context \+ ': ' \+ \(err && err\.message/);
});

test('missing PICKER_API_KEY fails loud with the property name', () => {
  const { ctx } = regrantCtx({ apiKey: null });
  assert.throws(() => ctx.getDriveRegrantConfig(), /PICKER_API_KEY/);
});

test('missing Day Planner folder fails loud', () => {
  const { ctx } = regrantCtx({ folderId: null });
  assert.throws(() => ctx.getDriveRegrantConfig(), /Day Planner folder is not set up/);
});

test('doGet ?view=regrant serves the Regrant page', () => {
  const { ctx, rendered } = regrantCtx();
  ctx.doGet({ parameter: { view: 'regrant' } });
  assert.deepEqual(rendered, ['Regrant']);
});

test('Regrant.html builds a multi-select Picker from the server config and re-probes after picking', () => {
  assert.match(REGRANT_HTML, /getDriveRegrantConfig/);
  assert.match(REGRANT_HTML, /\.setAppId\(cfg\.appId\)/);
  assert.match(REGRANT_HTML, /\.setDeveloperKey\(cfg\.apiKey\)/);
  assert.match(REGRANT_HTML, /\.setOAuthToken\(cfg\.token\)/);
  assert.match(REGRANT_HTML, /MULTISELECT_ENABLED/);
  assert.match(REGRANT_HTML, /setSelectFolderEnabled\(true\)/);
  assert.match(REGRANT_HTML, /driveWriteAccessReport/);
  assert.doesNotMatch(REGRANT_HTML, /951958469609/, 'appId comes from the server, not a second literal');
  assert.doesNotMatch(REGRANT_HTML, /border-radius:\s*(50%|9{3,}px)/, 'no pills');
});
