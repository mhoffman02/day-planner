/**
 * @file runLogFolderReentry.test.js
 * @description First run (no root folder, no Run Log Doc cached): a failure logged from inside
 * getValidatedRootFolder must not re-enter folder discovery through the Run Log sink
 * (logError -> recordServerLog -> appendRunLogToDoc_ -> getValidatedRootFolder) and create a
 * second "Day Planner" folder.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile } from './helpers/gasRuntimeStubs.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function folderHandle(ctx, f) {
  return {
    getId: () => f.id,
    getName: () => f.title,
    getFilesByName: (name) => {
      const hits = ctx.__fakes.driveFiles.filter((x) => x.title === name && x.parents.some((p) => p.id === f.id));
      let i = 0;
      return { hasNext: () => i < hits.length, next: () => ({ getId: () => hits[i++].id }) };
    }
  };
}

function firstRunCtx() {
  const ctx = makeGasContext();
  ctx.DriveApp = {
    getFoldersByName: () => ({ hasNext: () => false, next: () => { throw new Error('empty'); } }),
    getFolderById: (id) => {
      const f = ctx.__fakes.driveFiles.find((x) => x.id === id && x.mimeType === FOLDER_MIME);
      if (!f) throw new Error('No item with the given ID could be found, or you do not have permission to access it.');
      return folderHandle(ctx, f);
    },
    createFolder: () => { throw new Error('DriveApp.createFolder not expected'); }
  };
  loadGasFile(ctx, 'Code.gs');
  return ctx;
}

test('first-run folder discovery creates exactly one Day Planner folder even when a fallback logs an error', () => {
  const ctx = firstRunCtx();
  ctx.getRunLogDocUrl();
  const folders = ctx.__fakes.driveFiles.filter((f) => f.mimeType === FOLDER_MIME && f.title === 'Day Planner');
  assert.equal(folders.length, 1, `expected one Day Planner folder, got ${folders.length}`);
  assert.equal(ctx.PropertiesService.getUserProperties().getProperty('DAY_PLANNER_ROOT_FOLDER_ID'), folders[0].id);
  assert.match(ctx.__consoleLines.join('\n'), /known default folder not accessible[\s\S]*\n\s+at /, 'the fallback must still console.error its stack');
});
