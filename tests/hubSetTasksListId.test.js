/**
 * @file hubSetTasksListId.test.js
 * @description hubSetTasksListId RPC: lets the agent (gas-rpc) point the hub at another Google Tasks list (L6 forced
 * failure + restore) without a manual Sheet edit. Runs the real Config.gs on the Sheets fake.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext } from './helpers/gasFakesHub.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));

test('hubSetTasksListId writes TasksListId to the Config tab and returns the previous value', () => {
  const ctx = makeHubContext({ realStores: true, features: { GMAIL_ROUTER: true } });
  const before = ctx.DPConfig.getConfig().TasksListId;
  const r = call(ctx, 'hubSetTasksListId', 'bogus-list-id');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.previous, before);
  assert.equal(r.tasksListId, 'bogus-list-id');
  assert.equal(ctx.DPConfig.getConfig().TasksListId, 'bogus-list-id');
  const back = call(ctx, 'hubSetTasksListId', before);
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.equal(ctx.DPConfig.getConfig().TasksListId, before);
});

test('hubSetTasksListId rejects non-string, empty, spaced or oversized ids without writing', () => {
  const ctx = makeHubContext({ realStores: true, features: { GMAIL_ROUTER: true } });
  const before = ctx.DPConfig.getConfig().TasksListId;
  for (const bad of [undefined, null, 7, '', 'has space', '=IMPORTRANGE("x")', 'x'.repeat(201)]) {
    const r = call(ctx, 'hubSetTasksListId', bad);
    assert.equal(r.ok, false, String(bad));
    assert.equal(r.errorCode, 'INVALID_INPUT');
  }
  assert.equal(ctx.DPConfig.getConfig().TasksListId, before);
});

test('hubSetTasksListId has a top-level Code.gs delegator for gas-rpc', () => {
  const code = fs.readFileSync(new URL('../gas-app/Code.gs', import.meta.url), 'utf8');
  assert.match(code, /^function hubSetTasksListId\(listId\) \{/m);
});
