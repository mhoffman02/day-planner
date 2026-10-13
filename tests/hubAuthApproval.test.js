/**
 * @file hubAuthApproval.test.js
 * @description User 2026-10-12: "a user would never know" to run a function in the Apps Script editor to approve a
 * new scope. getHubStatus (app load) checks ScriptApp.getAuthorizationInfo and, when the owner has not approved the
 * current scopes, returns AUTH_REQUIRED with Google's own consent URL so the app can show an "Approve access" link.
 * It creates nothing until approved (no half-set-up Sheet from failed Gmail calls).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext } from './helpers/gasFakesHub.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const URL = 'https://script.google.com/macros/d/abc/authorize';

test('unapproved scopes: getHubStatus returns AUTH_REQUIRED with the consent URL and creates nothing', () => {
  const ctx = makeHubContext({ realStores: 'cold' });
  ctx.__hub.authUrl = URL;
  const st = call(ctx, 'getHubStatus');
  assert.equal(st.ok, false);
  assert.equal(st.status, 'AUTH_REQUIRED');
  assert.equal(st.authUrl, URL);
  assert.equal(ctx.DPConfig.isProvisioned(), false);
  assert.equal(ctx.__hub.triggers.length, 0);
});

test('after approval the next check sets the hub up as usual', () => {
  const ctx = makeHubContext({ realStores: 'cold' });
  ctx.__hub.authUrl = URL;
  call(ctx, 'getHubStatus');
  ctx.__hub.authUrl = null;
  const st = call(ctx, 'getHubStatus');
  assert.equal(st.ok, true, JSON.stringify(st));
  assert.equal(st.authUrl, undefined);
  assert.equal(st.triggers, 1);
});

test('the authorization check itself failing is logged and does not block the app', () => {
  const ctx = makeHubContext({ realStores: 'cold' });
  ctx.ScriptApp.getAuthorizationInfo = () => { throw new Error('auth info unavailable'); };
  const st = call(ctx, 'getHubStatus');
  assert.equal(st.ok, true, JSON.stringify(st));
  assert.match(ctx.__consoleLines.join('\n'), /auth info unavailable/);
});
