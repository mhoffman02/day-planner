/**
 * @file driveWriteAccessReport.test.js
 * @description Drive grant probe (gas-app/Code.gs driveWriteAccessReport). After the script was linked to
 * a standard GCP project (2026-10-10), drive.file write grants for files created under the old default
 * project were lost. Drive metadata (editable, capabilities.canEdit) reflects the USER's role, not the
 * app's grant (live HOME: hub Sheet reports canEdit=true yet Sheets writes 403), so the probe makes a
 * no-op metadata patch per file (empty body, modifiedDateBehavior noChange) and records whether Drive
 * refused it. Permission refusals are data; any other failure throws.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';

const FOLDER = 'folder1';
const DENIED = 'API call to drive.files.patch failed with error: The user does not have sufficient permissions for this file.';

function probeCtx({ folderId = FOLDER, patchError = {} } = {}) {
  const ctx = makeGasContext();
  if (folderId) ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', folderId);
  const calls = [];
  ctx.Drive.Files.get = (id, opts) => {
    calls.push(['get', id, toHost(opts)]);
    return { id, title: 'Day Planner', mimeType: 'application/vnd.google-apps.folder' };
  };
  ctx.Drive.Files.list = (opts) => {
    calls.push(['list', toHost(opts)]);
    return { items: [
      { id: 'sheet1', title: 'Day Planner Hub', mimeType: 'application/vnd.google-apps.spreadsheet' },
      { id: 'doc1', title: 'Notes Oct', mimeType: 'application/vnd.google-apps.document' }
    ] };
  };
  ctx.Drive.Files.patch = (resource, id, opts) => {
    calls.push(['patch', toHost(resource), id, toHost(opts)]);
    if (patchError[id]) throw new Error(patchError[id]);
    return { id };
  };
  for (const w of ['insert', 'update', 'remove', 'trash', 'touch', 'copy']) {
    ctx.Drive.Files[w] = () => { throw new Error('probe must not call Drive.Files.' + w); };
  }
  loadGasFile(ctx, 'Code.gs');
  return { ctx, calls };
}

test('no-op patches the folder and each child, reporting which ones the app may write', () => {
  const { ctx, calls } = probeCtx({ patchError: { sheet1: DENIED } });
  const out = toHost(ctx.driveWriteAccessReport());
  assert.equal(out.ok, true);
  assert.deepEqual(out.folder, { id: FOLDER, title: 'Day Planner', mimeType: 'application/vnd.google-apps.folder', appCanWrite: true });
  assert.deepEqual(out.files, [
    { id: 'sheet1', title: 'Day Planner Hub', mimeType: 'application/vnd.google-apps.spreadsheet', appCanWrite: false, error: DENIED },
    { id: 'doc1', title: 'Notes Oct', mimeType: 'application/vnd.google-apps.document', appCanWrite: true }
  ]);
  assert.deepEqual(out.unwritable, ['sheet1']);
  const patches = calls.filter((c) => c[0] === 'patch');
  assert.deepEqual(patches.map((p) => p[2]), [FOLDER, 'sheet1', 'doc1']);
  for (const p of patches) {
    assert.deepEqual(p[1], {});
    assert.deepEqual(p[3], { modifiedDateBehavior: 'noChange', updateViewedDate: false, fields: 'id' });
  }
  assert.equal(calls.find((c) => c[0] === 'list')[1].q, "'" + FOLDER + "' in parents and trashed = false");
});

test('folder refusal is reported in unwritable too', () => {
  const { ctx } = probeCtx({ patchError: { [FOLDER]: DENIED } });
  assert.deepEqual(toHost(ctx.driveWriteAccessReport()).unwritable, [FOLDER]);
});

test('a non-permission Drive failure throws instead of being reported as a grant gap', () => {
  const { ctx } = probeCtx({ patchError: { doc1: 'Service unavailable: Drive' } });
  assert.throws(() => ctx.driveWriteAccessReport(), /Service unavailable/);
  assert.match(ctx.__consoleLines.join('\n'), /driveWriteAccessReport/);
});

test('fails loud when no Day Planner folder is bound yet (no discovery side effects)', () => {
  const { ctx, calls } = probeCtx({ folderId: null });
  assert.throws(() => ctx.driveWriteAccessReport(), /Day Planner folder is not set up/);
  assert.equal(calls.length, 0);
});
