/**
 * @file backgroundSync.test.js
 * @description The shell page (doGet) must return without the 2-Way Sync pass or the trigger check (they cost
 * ~2 s of every cold load, measured 2026-11-06). They run in runBackgroundSync, which the client calls once
 * the first screen has painted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile } from './helpers/gasRuntimeStubs.js';

function ctxWithTriggerSpy() {
  const ctx = makeGasContext();
  ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', 'folder1');
  const calls = { getProjectTriggers: 0 };
  ctx.ScriptApp = {
    getProjectTriggers: () => { calls.getProjectTriggers += 1; return [{ getHandlerFunction: () => 'syncWorkspaceChanges' }]; },
    getOAuthToken: () => 'tok'
  };
  ctx.DriveApp = { getFolderById: (id) => ({ getId: () => id }) };
  ctx.console.info = ctx.console.log;
  const output = { setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; }, setFaviconUrl() { return this; } };
  ctx.HtmlService = {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createTemplateFromFile: () => ({ evaluate: () => output })
  };
  loadGasFile(ctx, 'Code.gs');
  return { ctx, calls };
}

test('doGet serves the shell without running the sync pass or the trigger check', () => {
  const { ctx, calls } = ctxWithTriggerSpy();
  ctx.doGet({ parameter: {} });
  assert.equal(calls.getProjectTriggers, 0);
});

test('runBackgroundSync runs the trigger check', () => {
  const { ctx, calls } = ctxWithTriggerSpy();
  ctx.runBackgroundSync();
  assert.ok(calls.getProjectTriggers >= 1);
});
