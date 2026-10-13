/**
 * @file hubTrialMode.test.js
 * @description In-app trial mode controls (UX review 2026-10-12): the mock mirrors hubSetFeature and the
 * MODE_CHANGED guard; every Triage write in the client sends the mode on screen; the Go live dialog and
 * shared trial banner replace the per-view "Dry run is ON" banners (whose ledger wording was wrong).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HubMock } from '../src/hubMock.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('mock: hubSetFeature flips trial mode and getHubStatus reports it', () => {
  const hub = new HubMock({ dryRun: true });
  assert.equal(hub.getHubStatus().dryRun, true);
  assert.equal(hub.getHubStatus().lastRun.status, 'DRY_RUN');
  const r = hub.hubSetFeature('DRY_RUN', false);
  assert.equal(r.ok, true);
  assert.equal(r.dryRun, false);
  assert.equal(hub.getHubStatus().dryRun, false);
  assert.equal(hub.hubSetFeature('DRY_RUN', 'false').errorCode, 'INVALID_INPUT');
  assert.equal(hub.hubSetFeature('NOPE', true).errorCode, 'INVALID_INPUT');
});

test('mock: a Triage write with a stale expectDryRun is refused and changes nothing', () => {
  const hub = new HubMock({ dryRun: false });
  const id = hub.getTriageBoard({}).queues.directAction[0].threadId;
  const r = hub.archiveTriageThread(id, { expectDryRun: true });
  assert.equal(r.errorCode, 'MODE_CHANGED');
  assert.ok(hub.getTriageBoard({}).queues.directAction.some((t) => t.threadId === id), 'thread stays on the board');
  assert.equal(hub.archiveTriageThread(id, { expectDryRun: false }).status, 'DONE');
});

for (const file of ['src/app.js', 'gas-app/Script.html']) {
  test(`${file}: every Triage write sends the mode on screen`, () => {
    const src = read(file);
    const calls = src.match(/this\.bridge\.(routeThreadToTask|routeThreadToWaiting|routeThreadToMeeting|dismissTriageItem|archiveTriageThread|trashTriageThread)\([^\n]*/g) || [];
    assert.equal(calls.length, 6, calls.join('\n'));
    for (const c of calls) assert.match(c, /hubModeOpts\(\)/, c);
  });
}

for (const file of ['index.html', 'gas-app/Index.html']) {
  test(`${file}: shared trial banner and Go live dialog replace the per-view Dry run banners`, () => {
    const html = read(file);
    assert.doesNotMatch(html, /Dry run is ON/);
    assert.doesNotMatch(html, /recorded in the ledger/);
    assert.equal((html.match(/class="hub-banner hub-banner-dryrun trial-mode-banner"/g) || []).length, 1);
    assert.match(html, /role="alertdialog"[^>]*aria-labelledby="goLiveTitle"/);
    assert.match(html, /x-ref="goLiveCancel"/);
    assert.match(html, /@click="switchToTrial\(\)">Undo</);
    assert.equal((html.match(/@click="switchToTrial\(\)">Switch to trial</g) || []).length, 2, 'Triage and Meeting Prep headers');
  });
}
