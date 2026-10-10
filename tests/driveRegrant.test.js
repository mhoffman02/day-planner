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

function regrantCtx({ apiKey = 'k-123', folderId = 'folder1' } = {}) {
  const ctx = makeGasContext();
  if (apiKey) ctx.PropertiesService.getScriptProperties().setProperty('PICKER_API_KEY', apiKey);
  if (folderId) ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', folderId);
  ctx.ScriptApp = { getOAuthToken: () => 'tok-abc' };
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
