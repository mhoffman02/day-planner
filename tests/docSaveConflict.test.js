/**
 * @file docSaveConflict.test.js
 * @description Phase 32: saveDailyDocCards must not overwrite edits made directly in the monthly
 * notes Doc. The client sends the day text it last loaded or saved (the baseline); the server
 * refuses the write when that day section in the Doc no longer matches it, and pins the write to
 * the revision it read (writeControl). Runs the REAL gas-app/Code.gs in a vm with Docs fakes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DOC_MIME = 'application/vnd.google-apps.document';
const DAY = '2026-10-29';
const OTHER_DAY = '2026-10-30';
const emptyIter = () => ({ hasNext: () => false, next: () => { throw new Error('empty'); } });

function codeCtx() {
  const ctx = makeGasContext();
  ctx.__fakes.driveFiles.push({ id: 'ROOT', title: 'Day Planner', mimeType: FOLDER_MIME, parents: [] });
  const root = {
    getId: () => 'ROOT',
    getName: () => 'Day Planner',
    getFoldersByName: emptyIter,
    getFilesByName: (name) => {
      const hits = ctx.__fakes.driveFiles.filter((x) => x.title === name && x.parents.some((p) => p.id === 'ROOT'));
      let i = 0;
      return { hasNext: () => i < hits.length, next: () => ({ getId: () => hits[i++].id }) };
    }
  };
  ctx.DriveApp = {
    getFoldersByName: emptyIter,
    getFolderById: (id) => { if (id !== 'ROOT') throw new Error('No item with the given ID'); return root; }
  };
  ctx.Utilities.formatDate = () => '2026-10-29 12:00:00';
  ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', 'ROOT');
  loadGasFile(ctx, 'Code.gs');
  return ctx;
}

const save = (ctx, date, text, baseline) => toHost(ctx.saveDailyDocCards(date, text, baseline));
const read = (ctx, date) => ctx.getOrCreateDailyDocContent(date);
const monthDoc = (ctx) => ctx.__fakes.docs[ctx.__fakes.driveFiles.find((f) => f.mimeType === DOC_MIME).id];

const V1 = '### #index [Work] Plan\n- first bullet\nplain line';

test('control: the fake Doc round-trips a saved day section exactly', () => {
  const ctx = codeCtx();
  assert.equal(save(ctx, DAY, V1).success, true);
  assert.equal(read(ctx, DAY), V1);
});

test('a save whose baseline still matches the Doc section is written', () => {
  const ctx = codeCtx();
  save(ctx, DAY, V1);
  const r = save(ctx, DAY, V1 + '\n- second bullet', V1);
  assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(read(ctx, DAY), V1 + '\n- second bullet');
});

test('a save is REFUSED (conflict) when the day section was edited in the Doc since the baseline', () => {
  const ctx = codeCtx();
  save(ctx, DAY, V1);
  const docEdit = V1 + '\n- typed straight into Google Docs';
  save(ctx, DAY, docEdit); // stands in for a direct edit of the Doc
  const r = save(ctx, DAY, V1 + '\n- typed in the app', V1);
  assert.equal(r.success, false);
  assert.equal(r.conflict, true);
  assert.match(r.error, /changed in Google Docs/i);
  assert.equal(r.currentContent, docEdit);
  assert.equal(read(ctx, DAY), docEdit, 'the Doc edit must survive');
});

test('blank lines in the baseline (dropped by the Doc) do not count as a conflict', () => {
  const ctx = codeCtx();
  save(ctx, DAY, V1);
  const r = save(ctx, DAY, 'new text', `${V1.replace('\n', '\n\n')}\n\n`);
  assert.equal(r.success, true, JSON.stringify(r));
});

test('edits to ANOTHER day in the same month Doc do not block this day', () => {
  const ctx = codeCtx();
  save(ctx, DAY, V1);
  save(ctx, OTHER_DAY, 'other day v1');
  save(ctx, OTHER_DAY, 'other day v2');
  const r = save(ctx, DAY, 'mine', V1);
  assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(read(ctx, DAY), 'mine');
  assert.equal(read(ctx, OTHER_DAY), 'other day v2');
});

test('a day missing from the Doc is created whatever the baseline says (nothing to overwrite)', () => {
  const ctx = codeCtx();
  const r = save(ctx, DAY, 'fresh', '### #index [General] Daily Notes\n- Initialized daily topic card.');
  assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(read(ctx, DAY), 'fresh');
});

test('the replacing batchUpdate is pinned to the revision the server read (writeControl)', () => {
  const ctx = codeCtx();
  save(ctx, DAY, V1);
  const bodies = [];
  const real = ctx.Docs.Documents.batchUpdate;
  ctx.Docs.Documents.batchUpdate = (body, id) => { bodies.push(JSON.parse(JSON.stringify(body))); return real.call(ctx.Docs.Documents, body, id); };
  const rev = monthDoc(ctx).revisionId;
  assert.equal(save(ctx, DAY, 'v2', V1).success, true);
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].writeControl, { requiredRevisionId: rev });
});

test('a Doc change between the read and the write fails the save (nothing written), not a silent overwrite', () => {
  const ctx = codeCtx();
  save(ctx, DAY, V1);
  const real = ctx.Docs.Documents.get;
  ctx.Docs.Documents.get = (id, opts) => {
    const res = real.call(ctx.Docs.Documents, id, opts);
    monthDoc(ctx).revisionId = 'rev999'; // someone types in the Doc right after our read
    return res;
  };
  const r = save(ctx, DAY, 'v2', V1);
  assert.equal(r.success, false);
  ctx.Docs.Documents.get = real;
  assert.equal(read(ctx, DAY), V1);
});
