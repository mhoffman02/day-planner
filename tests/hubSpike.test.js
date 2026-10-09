// IDE helper UnitTests.gs:hubSpike — the IDE hides return values, so the live Sheets-under-drive.file
// spike must log every step (Sheet URL, tabs, config, discovery) and end with a PASS/FAIL line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHubContext, lines } from './helpers/gasFakesHub.js';
import { loadGasFile } from './helpers/gasRuntimeStubs.js';

test('hubSpike provisions the Sheet and logs each step plus a PASS line', () => {
  const ctx = makeHubContext({ realStores: 'cold' });
  loadGasFile(ctx, 'UnitTests.gs');
  const out = ctx.hubSpike();
  const log = lines(ctx);
  assert.equal(out.ok, true);
  assert.match(log, /\[hubSpike\] Sheet: https:\/\/docs\.google\.com\/spreadsheets\/d\//);
  assert.match(log, /\[hubSpike\] Tabs: .*Config.*Meeting Registry.*Integration Ledger/);
  assert.match(log, /\[hubSpike\] Config: .*Me@Example\.test/);
  assert.match(log, /\[hubSpike\] discoverMeetingSeries: /);
  assert.match(log, /\[hubSpike\] RESULT: PASS/);
});

test('hubSpike logs the failing step and rethrows (no silent failure)', () => {
  const ctx = makeHubContext({ realStores: 'cold' });
  loadGasFile(ctx, 'UnitTests.gs');
  const realGet = ctx.Sheets.Spreadsheets.get;
  ctx.Sheets.Spreadsheets.get = (sid, opts) => {
    if (opts && opts.fields === 'sheets.properties.title') throw new Error('403 insufficient permission');
    return realGet(sid, opts);
  };
  assert.throws(() => ctx.hubSpike(), /403 insufficient permission/);
  assert.match(lines(ctx), /\[hubSpike\] RESULT: FAIL at Tabs: 403 insufficient permission/);
});
