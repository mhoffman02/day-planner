/**
 * @file webAppHardening.test.js
 * @description Served-page hardening from the 2026-11 security review:
 *  - X-Frame-Options: every HtmlOutput uses DEFAULT (nothing in the repo frames the app; ALLOWALL let
 *    any site iframe the owner-authenticated app for clickjacking).
 *  - ?clear_logs=1 no longer wipes the server log ring buffer on a plain GET (a cross-site link could
 *    erase it); the self-test page clears through google.script.run (clearServerLogs) instead.
 *  - The pinned Alpine CDN script carries Subresource Integrity (sha384 + crossorigin).
 *  - Every static target="_blank" anchor carries rel="noopener noreferrer".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeGasContext, loadGasFile } from './helpers/gasRuntimeStubs.js';

const ROOT = path.join(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const GAS_FILES = fs.readdirSync(path.join(ROOT, 'gas-app')).filter((f) => f.endsWith('.gs'));
const HTML_FILES = ['index.html', ...fs.readdirSync(path.join(ROOT, 'gas-app')).filter((f) => f.endsWith('.html')).map((f) => `gas-app/${f}`)];

/** Code.gs in a vm with an HtmlService stub that records every X-Frame-Options mode it is given. */
function webCtx() {
  const ctx = makeGasContext();
  ctx.console.info = ctx.console.log;
  ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', 'folder1');
  ctx.PropertiesService.getUserProperties().setProperty('RECENT_SERVER_LOGS', JSON.stringify([{ level: 'ERROR', message: 'evidence' }]));
  ctx.DriveApp = { getFolderById: () => ({ getId: () => 'folder1', getName: () => 'Day Planner' }) };
  const modes = [];
  const rendered = [];
  const output = {
    setTitle() { return this; }, addMetaTag() { return this; }, setFaviconUrl() { return this; },
    setXFrameOptionsMode(mode) { modes.push(mode); return this; }
  };
  ctx.HtmlService = {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
    createTemplateFromFile: (name) => { rendered.push(name); return { evaluate: () => output }; }
  };
  loadGasFile(ctx, 'Code.gs');
  return { ctx, modes, rendered };
}

for (const [label, parameter, page] of [
  ['main app', {}, 'Index'],
  ['setup page', { setup: '1' }, 'SetupFolder'],
  ['regrant page', { view: 'regrant' }, 'Regrant']
]) {
  test(`doGet ${label} is served with XFrameOptionsMode.DEFAULT (not framable cross-site)`, () => {
    const { ctx, modes, rendered } = webCtx();
    ctx.doGet({ parameter });
    assert.deepEqual(rendered, [page]);
    assert.deepEqual(modes, ['DEFAULT']);
  });
}

test('no gas-app server file sets XFrameOptionsMode.ALLOWALL', () => {
  for (const f of GAS_FILES) {
    assert.doesNotMatch(read(`gas-app/${f}`), /XFrameOptionsMode\.ALLOWALL/, `gas-app/${f}`);
  }
  assert.match(read('gas-app/UnitTests.gs'), /setXFrameOptionsMode\(HtmlService\.XFrameOptionsMode\.DEFAULT\)/);
});

test('GET ?clear_logs=1 does not wipe the server log ring buffer', () => {
  const { ctx } = webCtx();
  ctx.doGet({ parameter: { clear_logs: '1', view: 'regrant' } });
  assert.match(String(ctx.PropertiesService.getUserProperties().getProperty('RECENT_SERVER_LOGS')), /evidence/);
});

test('clearServerLogs is a top-level google.script.run delegator that clears the buffer', () => {
  const code = read('gas-app/Code.gs');
  assert.match(code, /\nfunction clearServerLogs\(\) \{/, 'top-level delegator (Apps Script static scan)');
  assert.match(code, /global\._clearServerLogsInternal = clearRecentServerLogs;/);
  const { ctx } = webCtx();
  assert.equal(ctx.clearServerLogs().success, true);
  assert.equal(ctx.PropertiesService.getUserProperties().getProperty('RECENT_SERVER_LOGS'), null);
});

test('self-test page clears logs via google.script.run, not a GET link, and fails loud', () => {
  const unit = read('gas-app/UnitTests.gs');
  assert.doesNotMatch(unit, /clear_logs=1/);
  assert.match(unit, /google\.script\.run[\s\S]{0,1200}\.clearServerLogs\(\)/);
  assert.match(unit, /withFailureHandler\(function \(err\) \{ console\.error\(/);
});

test('pinned Alpine CDN script has SRI sha384 and crossorigin=anonymous', () => {
  const html = read('gas-app/Index.html');
  const tag = (html.match(/<script[^>]*alpinejs[^>]*><\/script>/) || [''])[0];
  assert.match(tag, /src="https:\/\/cdn\.jsdelivr\.net\/npm\/alpinejs@3\.14\.8\/dist\/cdn\.min\.js"/, 'exact version pinned');
  assert.match(tag, /integrity="sha384-X9kJyAubVxnP0hcA\+AMMs21U445qsnqhnUF8EBlEpP3a42Kh\/JwWjlv2ZcvGfphb"/);
  assert.match(tag, /crossorigin="anonymous"/);
});

test('every CDN <script src> in served HTML is version-pinned and has SRI', () => {
  for (const f of HTML_FILES) {
    for (const m of read(f).matchAll(/<script\b[^>]*\bsrc="https:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)[^"]*"[^>]*>/g)) {
      assert.match(m[0], /@\d+\.\d+\.\d+\//, `${f}: unpinned ${m[0]}`);
      assert.match(m[0], /integrity="sha(?:256|384|512)-[A-Za-z0-9+/=]+"/, `${f}: no SRI on ${m[0]}`);
      assert.match(m[0], /crossorigin="anonymous"/, `${f}: no crossorigin on ${m[0]}`);
    }
  }
});

test('every static target="_blank" anchor has rel="noopener noreferrer"', () => {
  const sources = HTML_FILES.map((f) => [f, read(f)]).concat(GAS_FILES.map((f) => [`gas-app/${f}`, read(`gas-app/${f}`)]));
  for (const [f, text] of sources) {
    // Comment prose may mention a bare <a target="_blank">; only markup and string-built tags count.
    const code = text.split('\n').filter((l) => !/^\s*(?:\/\/|\/?\*)/.test(l)).join('\n');
    for (const m of code.matchAll(/<a\b[^>]*target=\\?"_blank\\?"[^>]*>/g)) {
      assert.match(m[0], /rel=\\?"noopener noreferrer\\?"/, `${f}: ${m[0]}`);
    }
  }
});
