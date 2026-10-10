/**
 * @file codeGsFailClosed.test.js
 * @description Regression tests (2026-10-09 fail-open review) for gas-app/Code.gs, run against the
 * REAL file in a vm with GAS stubs. Each test was seen failing for its stated reason before the fix:
 *  #1 getValidatedRootFolder adopted the hard-coded default folder with no owner check.
 *  #2 getFolderByNameOrCreate returned the PARENT folder when subfolder creation failed.
 *  #3 searchArchiveNotes returned [] / partial results on failure, indistinguishable from no matches.
 *  #4 pullDictationScratchText reported a plain success when clearing the scratch Doc failed.
 *  #5 the Run Log writer (recordServerLog) could adopt/create the root folder via getValidatedRootFolder.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile, toHost, fakeDocText } from './helpers/gasRuntimeStubs.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DOC_MIME = 'application/vnd.google-apps.document';
const DEFAULT_ID = '1N2WRrFmtsAWKgqeaFIj9HtiQ2wupFEk0';
const ROOT_KEY = 'DAY_PLANNER_ROOT_FOLDER_ID';
const emptyIter = () => ({ hasNext: () => false, next: () => { throw new Error('empty'); } });

function folderHandle(ctx, f) {
  return {
    getId: () => f.id,
    getName: () => f.title,
    getFoldersByName: emptyIter,
    createFolder: (name) => { throw new Error(`parent.createFolder(${name}) denied`); },
    getFilesByName: (name) => {
      const hits = ctx.__fakes.driveFiles.filter((x) => x.title === name && x.parents.some((p) => p.id === f.id));
      let i = 0;
      return { hasNext: () => i < hits.length, next: () => ({ getId: () => hits[i++].id }) };
    }
  };
}

/**
 * @param {{folders?:string[], access?:Function, rootId?:string}} o folders: ids of pre-existing
 * folders; access(id): Drive.Files.get result for driveFolderAccess_; rootId: cached root folder id.
 */
function codeCtx(o = {}) {
  const ctx = makeGasContext();
  for (const id of o.folders || []) ctx.__fakes.driveFiles.push({ id, title: 'Day Planner', mimeType: FOLDER_MIME, parents: [] });
  ctx.DriveApp = {
    getFoldersByName: emptyIter,
    getFolderById: (id) => {
      const f = ctx.__fakes.driveFiles.find((x) => x.id === id && x.mimeType === FOLDER_MIME);
      if (!f) throw new Error('No item with the given ID could be found, or you do not have permission to access it.');
      return folderHandle(ctx, f);
    },
    createFolder: () => { throw new Error('DriveApp.createFolder not expected'); },
    searchFiles: () => { throw new Error('DriveApp.searchFiles not expected'); }
  };
  ctx.Drive.Files.get = o.access || (() => { throw new Error('Drive.Files.get not expected'); });
  ctx.Utilities.formatDate = () => '2026-10-09 12:00:00';
  if (o.rootId) ctx.PropertiesService.getUserProperties().setProperty(ROOT_KEY, o.rootId);
  loadGasFile(ctx, 'Code.gs');
  return ctx;
}

const rootProp = (ctx) => ctx.PropertiesService.getUserProperties().getProperty(ROOT_KEY);
const newFolders = (ctx) => ctx.__fakes.driveFiles.filter((f) => f.mimeType === FOLDER_MIME && f.id !== DEFAULT_ID && f.id !== 'ROOT');
const consoleText = (ctx) => ctx.__consoleLines.join('\n');

function seedDoc(ctx, text, id) {
  const doc = ctx.Docs.Documents.create({ title: 'Day Planner Notes - October 2026' });
  ctx.Docs.Documents.batchUpdate({ requests: [{ insertText: { location: { index: 1 }, text } }] }, doc.documentId);
  if (id) {
    ctx.__fakes.docs[id] = ctx.__fakes.docs[doc.documentId];
    return id;
  }
  return doc.documentId;
}

// ---------------------------------------------------------------- #1 default folder owner check
test('#1 the hard-coded default folder is NOT adopted when the user is only a reader', () => {
  const ctx = codeCtx({ folders: [DEFAULT_ID], access: () => ({ editable: false, userPermission: { role: 'reader' } }) });
  const root = ctx.getFolderByNameOrCreate(null, 'Day Planner');
  assert.notEqual(rootProp(ctx), DEFAULT_ID);
  assert.notEqual(root.getId(), DEFAULT_ID);
  assert.match(consoleText(ctx), /known default folder[^\n]*not owned/);
});

test('#1 the default folder is NOT adopted when the owner check throws (fail closed, stack logged)', () => {
  const ctx = codeCtx({ folders: [DEFAULT_ID], access: () => { throw new Error('Drive 403'); } });
  ctx.getFolderByNameOrCreate(null, 'Day Planner');
  assert.notEqual(rootProp(ctx), DEFAULT_ID);
  assert.match(consoleText(ctx), /known default folder[^\n]*\n[\s\S]*Drive 403[\s\S]*\n\s+at /);
});

test('#1 control: the default folder IS adopted when the user owns it', () => {
  const ctx = codeCtx({ folders: [DEFAULT_ID], access: () => ({ editable: true, userPermission: { role: 'owner' } }) });
  assert.equal(ctx.getFolderByNameOrCreate(null, 'Day Planner').getId(), DEFAULT_ID);
  assert.equal(rootProp(ctx), DEFAULT_ID);
  assert.equal(newFolders(ctx).length, 0);
});

// ---------------------------------------------------------------- #2 subfolder create failure
test('#2 getFolderByNameOrCreate throws (never returns the parent) when the subfolder cannot be created', () => {
  const ctx = codeCtx({ folders: ['ROOT'], rootId: 'ROOT' });
  ctx.Drive.Files.insert = () => { throw new Error('insert quota'); };
  const parent = ctx.DriveApp.getFolderById('ROOT');
  let returned;
  assert.throws(() => { returned = ctx.getFolderByNameOrCreate(parent, '2026'); }, (err) => {
    assert.match(err.message, /2026/);
    assert.match(err.message, /insert quota/);
    assert.match(err.message, /parent\.createFolder\(2026\) denied/);
    return true;
  }, `returned ${returned && returned.getId && returned.getId()}`);
});

// ---------------------------------------------------------------- #3 archive search failure flags
function archiveCtx() {
  const ctx = codeCtx();
  ctx.DriveApp.searchFiles = () => { throw new Error('searchFiles down'); };
  return ctx;
}

test('#3 total search failure throws instead of returning [] (indistinguishable from no matches)', () => {
  const ctx = archiveCtx();
  ctx.Drive.Files.list = () => { throw new Error('list down'); };
  assert.throws(() => ctx.searchArchiveNotes('alpha'), /archive search failed/i);
});

test('#3 an unreadable notes Doc marks every returned item partial:true with archiveError', () => {
  const ctx = archiveCtx();
  const good = seedDoc(ctx, 'Day Planner - Monday, October 5, 2026\nmet the alpha team\n');
  ctx.__fakes.inaccessibleDocs.add('DOCBAD');
  ctx.Drive.Files.list = () => ({ items: [{ id: good, title: 'Day Planner Notes - October 2026' }, { id: 'DOCBAD', title: 'Day Planner Notes - September 2026' }] });
  const res = toHost(ctx.searchArchiveNotes('alpha'));
  assert.ok(Array.isArray(res));
  assert.equal(res.length, 1);
  assert.equal(res[0].partial, true);
  assert.match(res[0].archiveError, /1 of 2 notes Docs could not be read/);
  assert.equal(res[0].date, '2026-10-05');
});

test('#3 failures with zero results throw (cannot claim "no matches")', () => {
  const ctx = archiveCtx();
  ctx.__fakes.inaccessibleDocs.add('DOCBAD');
  ctx.Drive.Files.list = () => ({ items: [{ id: 'DOCBAD', title: 'Day Planner Notes - September 2026' }] });
  assert.throws(() => ctx.searchArchiveNotes('alpha'), /could not be read/);
});

test('#3 control: a clean zero from Drive.Files.list is "no matches" ([], no flags) even if the DriveApp fallback fails', () => {
  const ctx = archiveCtx();
  ctx.Drive.Files.list = () => ({ items: [] });
  assert.deepEqual(toHost(ctx.searchArchiveNotes('alpha')), []);
});

test('#3 control: full success carries no partial flag', () => {
  const ctx = archiveCtx();
  const good = seedDoc(ctx, 'Day Planner - Monday, October 5, 2026\nmet the alpha team\n');
  ctx.Drive.Files.list = () => ({ items: [{ id: good, title: 'Day Planner Notes - October 2026' }] });
  const res = toHost(ctx.searchArchiveNotes('alpha'));
  assert.equal(res.length, 1);
  assert.equal('partial' in res[0], false);
});

// ---------------------------------------------------------------- #4 dictation scratch clear
const PLACEHOLDER = 'Click below, then use Tools > Voice typing (Ctrl+Shift+S).';

test('#4 pull reports cleared:false + clearError when the scratch Doc clear fails', () => {
  const ctx = codeCtx();
  const id = seedDoc(ctx, `${PLACEHOLDER}\nhello dictated world\n`, 'SCRATCH1');
  ctx.Docs.Documents.batchUpdate = () => { throw new Error('clear denied'); };
  const r = toHost(ctx.pullDictationScratchText(id));
  assert.equal(r.success, true);
  assert.equal(r.text, 'hello dictated world');
  assert.equal(r.cleared, false);
  assert.match(r.clearError, /clear denied/);
  assert.match(consoleText(ctx), /scratch Doc clear failed[\s\S]*\n\s+at /);
});

test('#4 control: a successful pull clears the Doc and reports cleared:true', () => {
  const ctx = codeCtx();
  const id = seedDoc(ctx, `${PLACEHOLDER}\nhello dictated world\n`, 'SCRATCH1');
  const r = toHost(ctx.pullDictationScratchText(id));
  assert.equal(r.success, true);
  assert.equal(r.text, 'hello dictated world');
  assert.equal(r.cleared, true);
  assert.equal(fakeDocText(ctx.__fakes.docs[id]).trim(), '');
});

// ---------------------------------------------------------------- #5 run-log writer never creates folders
test('#5 recordServerLog with no cached root folder creates no folder and no Doc (console only)', () => {
  const ctx = codeCtx();
  ctx.recordServerLog('ERROR', 'test', 'boom', null);
  assert.equal(newFolders(ctx).length, 0, 'Run Log writer must not create a folder');
  assert.equal(ctx.__fakes.driveFiles.length, 0, 'nothing created');
  assert.equal(rootProp(ctx), null);
  assert.match(consoleText(ctx), /no cached root folder[^\n]*Run Log Doc append skipped/);
});

test('#5 recordServerLog with a stale cached root id creates no folder', () => {
  const ctx = codeCtx({ rootId: 'GONE' });
  ctx.recordServerLog('ERROR', 'test', 'boom', null);
  assert.equal(ctx.__fakes.driveFiles.length, 0);
  assert.match(consoleText(ctx), /Run Log[\s\S]*\n\s+at /);
});

test('#5 control: with a valid cached root folder the Run Log Doc is created inside it and appended', () => {
  const ctx = codeCtx({ folders: ['ROOT'], rootId: 'ROOT' });
  ctx.recordServerLog('ERROR', 'test', 'boom', null);
  const docs = ctx.__fakes.driveFiles.filter((f) => f.mimeType === DOC_MIME);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].parents[0].id, 'ROOT');
  assert.match(fakeDocText(ctx.__fakes.docs[docs[0].id]), /\[ERROR\] \[test\] boom/);
  assert.equal(newFolders(ctx).length, 0);
});
