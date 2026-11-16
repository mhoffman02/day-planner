/**
 * @file backgroundSync.test.js
 * @description 2-Way Sync is retired (user decision 2026-11-16): nothing has tagged events with gasTaskId since
 * 2026-09-23, so the 5-minute pass had nothing to retitle. syncWorkspaceChanges survives only as the handler the
 * old trigger still names: it deletes that trigger and touches no Calendar or Tasks data. The shell page (doGet)
 * never checks triggers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeGasContext, loadGasFile } from './helpers/gasRuntimeStubs.js';

function trigger(handler) {
  return { handler, getHandlerFunction: () => handler };
}

function ctxWithTriggers(handlers) {
  const ctx = makeGasContext();
  ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', 'folder1');
  const state = { triggers: handlers.map(trigger), getProjectTriggers: 0, deleted: [], created: 0 };
  ctx.ScriptApp = {
    getProjectTriggers: () => { state.getProjectTriggers += 1; return state.triggers.slice(); },
    deleteTrigger: (t) => { state.deleted.push(t.handler); state.triggers = state.triggers.filter((x) => x !== t); },
    newTrigger: () => { state.created += 1; throw new Error('no trigger may be created'); },
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
  return { ctx, state };
}

test('doGet serves the shell without a trigger check', () => {
  const { ctx, state } = ctxWithTriggers(['syncWorkspaceChanges']);
  ctx.doGet({ parameter: {} });
  assert.equal(state.getProjectTriggers, 0);
});

test('the legacy syncWorkspaceChanges trigger deletes itself, keeps other triggers and reads no Calendar or Tasks data', () => {
  const { ctx, state } = ctxWithTriggers(['syncWorkspaceChanges', 'hubRouterTick', 'syncWorkspaceChanges']);
  const touched = [];
  ctx.Calendar.Events.list = () => { touched.push('Calendar.Events.list'); return { items: [] }; };
  ctx.Calendar.Events.patch = () => { touched.push('Calendar.Events.patch'); return {}; };
  ctx.Tasks.Tasks.list = () => { touched.push('Tasks.Tasks.list'); return { items: [] }; };
  ctx.syncWorkspaceChanges();
  assert.deepEqual(state.deleted, ['syncWorkspaceChanges', 'syncWorkspaceChanges']);
  assert.deepEqual(state.triggers.map((t) => t.handler), ['hubRouterTick']);
  assert.deepEqual(touched, []);
  assert.equal(state.created, 0);
});

test('the legacy handler logs its stack and rethrows when the trigger list fails', () => {
  const { ctx } = ctxWithTriggers([]);
  ctx.ScriptApp.getProjectTriggers = () => { throw new Error('Service unavailable: triggers'); };
  assert.throws(() => ctx.syncWorkspaceChanges(), /Service unavailable: triggers/);
  assert.match(ctx.__consoleLines.join('\n'), /syncWorkspaceChanges[\s\S]*Service unavailable: triggers[\s\S]*\n\s+at /);
});

test('the sync pass, its trigger setup and the after-first-paint call are gone', () => {
  const { ctx } = ctxWithTriggers([]);
  for (const name of ['runBackgroundSync', 'setup2WaySyncTrigger', 'ensure2WaySyncTriggerInstalled']) {
    assert.equal(typeof ctx[name], 'undefined', name + ' still defined in Code.gs');
  }
  const code = readFileSync(new URL('../gas-app/Code.gs', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /newTrigger\('syncWorkspaceChanges'\)/);
  for (const f of ['../src/app.js', '../src/gasBridge.js', '../gas-app/Script.html']) {
    assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), 'utf8'), /runBackgroundSync/, f);
  }
});
