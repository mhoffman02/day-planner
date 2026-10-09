// Regression: live HOME run of Code.gs:discoverMeetingSeries logged
// "Config: user email unavailable: ... Required permissions: .../userinfo.email".
// The manifest has no userinfo.email scope, so the hub must get the user's address from the
// Gmail profile (gmail.readonly) and never call Session.getActiveUser/getEffectiveUser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHubContext, addThread, lines } from './helpers/gasFakesHub.js';

test('first-run seed fills UserEmail from the Gmail profile without Session user lookups', () => {
  const ctx = makeHubContext({ realStores: 'cold' });
  ctx.DPConfig.ensureSetup();
  assert.equal(ctx.DPConfig.getConfig().UserEmail, 'Me@Example.test');
  assert.doesNotMatch(lines(ctx), /user email unavailable/);
});

test('getThreadMeta resolves the user email without Session and reads it once per execution', () => {
  const ctx = makeHubContext();
  let reads = 0;
  const real = ctx.DPConfig.getConfig;
  ctx.DPConfig = { ...ctx.DPConfig, getConfig: () => { reads += 1; return real(); } };
  addThread(ctx, { id: 't1', from: 'Boss <boss@example.test>' });
  addThread(ctx, { id: 't2', from: 'Boss <boss@example.test>' });
  ctx.DPGmailRepo.getThreadMeta('t1');
  ctx.DPGmailRepo.getThreadMeta('t2');
  assert.equal(reads, 1);
});
