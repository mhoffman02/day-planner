/**
 * @file codeGsNoStackToUi.test.js
 * @description User decision 1A (2026-10-30): a stack never reaches the UI (fail-loud-catch.md), except the
 * dev log viewer (getRecentServerLogs). Runs the REAL gas-app/Code.gs in a vm with GAS stubs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';

function ctxWith(htmlService) {
  const ctx = makeGasContext();
  ctx.console.info = ctx.console.log;
  ctx.console.error = () => {};
  if (htmlService) ctx.HtmlService = htmlService;
  loadGasFile(ctx, 'Code.gs');
  return ctx;
}

test('logError returns no stack to its caller (it is logged server-side only)', () => {
  const ctx = ctxWith();
  const err = new Error('boom');
  const out = toHost(ctx.logError('ctx', err));
  assert.equal('stack' in out, false, 'payload must not carry a stack');
  assert.equal(out.success, false);
  assert.match(out.error, /boom/);
  // the stack is still recorded in the server log ring buffer (dev log viewer)
  const logs = toHost(ctx.getRecentServerLogs());
  assert.ok(logs.some((l) => l.context === 'ctx' && /Error: boom/.test(l.stack || '')));
});

test('doGet render-failure page shows the message only, no stack frames or <pre>', () => {
  let html = '';
  const output = { setTitle() { return this; }, addMetaTag() { return this; }, setFaviconUrl() { return this; } };
  const ctx = ctxWith({
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createHtmlOutput: (h) => { html = h; return output; },
    createTemplateFromFile: () => { throw new Error('template exploded'); }
  });
  ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', 'folder1');
  ctx.getValidatedRootFolder = () => ({ getId: () => 'folder1' });
  ctx.doGet({ parameter: {} });
  assert.match(html, /template exploded/);
  assert.doesNotMatch(html, / {4}at /);
  assert.doesNotMatch(html, /<pre>/);
});
