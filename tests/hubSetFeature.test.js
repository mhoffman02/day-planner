/**
 * @file hubSetFeature.test.js
 * @description hubSetFeature RPC: lets the agent (gas-rpc) and IDE flip hub feature flags in the
 * Config tab without a manual Sheet edit. Runs the real Config.gs on the Sheets fake.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext } from './helpers/gasFakesHub.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));

test('hubSetFeature persists a flag to the Config tab and returns the fresh flags', () => {
  const ctx = makeHubContext({ realStores: true, features: { GMAIL_ROUTER: true, DRY_RUN: true } });
  const r = call(ctx, 'hubSetFeature', 'DRY_RUN', false);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.flags.DRY_RUN, false);
  assert.equal(r.flags.GMAIL_ROUTER, true);
  assert.equal(toHost(ctx.DPConfig.getFeatures({ fresh: true })).DRY_RUN, false);
  const back = call(ctx, 'hubSetFeature', 'DRY_RUN', true);
  assert.equal(back.flags.DRY_RUN, true);
});

test('hubSetFeature rejects unknown flags and non-boolean values without writing', () => {
  const ctx = makeHubContext({ realStores: true, features: { DRY_RUN: true } });
  for (const [name, value] of [['NOPE', true], ['DRY_RUN', 'false'], ['DRY_RUN', 0], [undefined, true]]) {
    const r = call(ctx, 'hubSetFeature', name, value);
    assert.equal(r.ok, false, `${String(name)}=${String(value)}`);
    assert.equal(r.errorCode, 'INVALID_INPUT');
  }
  assert.equal(toHost(ctx.DPConfig.getFeatures({ fresh: true })).DRY_RUN, true);
});
