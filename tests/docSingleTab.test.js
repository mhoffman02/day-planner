/**
 * @file docSingleTab.test.js
 * @description A notes Doc with more than one tab must fail loud. Without includeTabsContent the Docs API returns the
 * first tab only and writes default to it, so a hand-added tab would be silently ignored and the app would keep reading
 * and writing tab 1. Covers the pure check (docBodyContent), the monthly notes reader/writer in Code.gs, and the hub's
 * NotesRepository reader. The fake Docs service returns tabs only when the read asks for includeTabsContent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadEngines, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';
import { docBodyContent } from '../src/integration/docTabs.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DOC_MIME = 'application/vnd.google-apps.document';
const DAY = '2026-10-29';
const emptyIter = () => ({ hasNext: () => false, next: () => { throw new Error('empty'); } });

const tab = (id, content = [], childTabs) => ({ tabProperties: { tabId: id }, documentTab: { body: { content } }, ...(childTabs ? { childTabs } : {}) });

test('docBodyContent returns the only tab body', () => {
  const content = [{ startIndex: 1, endIndex: 3, paragraph: {} }];
  assert.deepEqual(docBodyContent({ tabs: [tab('t.0', content)] }, 'D1'), content);
});

test('docBodyContent throws naming the Doc and the tab count when there are several tabs', () => {
  assert.throws(() => docBodyContent({ tabs: [tab('t.0'), tab('t.1')] }, 'D1'), (e) => /D1.*2 tabs/.test(e.message) && e.code === 'DOC_MULTI_TAB');
});

test('docBodyContent counts a child tab as a second tab', () => {
  assert.throws(() => docBodyContent({ tabs: [tab('t.0', [], [tab('t.0.1')])] }, 'D1'), /2 tabs/);
});

test('docBodyContent throws when the read did not ask for tabs, instead of guessing at body', () => {
  assert.throws(() => docBodyContent({ body: { content: [] } }, 'D1'), /includeTabsContent/);
  assert.throws(() => docBodyContent(null, 'D1'), /D1/);
});

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

const monthDoc = (ctx) => ctx.__fakes.docs[ctx.__fakes.driveFiles.find((f) => f.mimeType === DOC_MIME).id];

test('control: a single-tab month Doc still saves and reads', () => {
  const ctx = codeCtx();
  assert.equal(toHost(ctx.saveDailyDocCards(DAY, 'hello')).success, true);
  assert.equal(ctx.getOrCreateDailyDocContent(DAY), 'hello');
});

test('reading a month Doc that gained a second tab throws, naming the tab count', () => {
  const ctx = codeCtx();
  ctx.saveDailyDocCards(DAY, 'hello');
  monthDoc(ctx).extraTabs = 1;
  assert.throws(() => ctx.getOrCreateDailyDocContent(DAY), /2 tabs/);
});

test('saving into a month Doc that gained a second tab is refused and writes nothing', () => {
  const ctx = codeCtx();
  ctx.saveDailyDocCards(DAY, 'hello');
  const doc = monthDoc(ctx);
  doc.extraTabs = 1;
  const before = doc.appliedRequests.length;
  let res;
  try { res = toHost(ctx.saveDailyDocCards(DAY, 'changed')); } catch (err) { res = { success: false, error: err.message }; }
  assert.equal(res.success, false, JSON.stringify(res));
  assert.match(String(res.error), /2 tabs/);
  assert.equal(doc.appliedRequests.length, before, 'no write may land in tab 1');
});

function repoCtx() {
  const ctx = makeGasContext();
  loadEngines(ctx);
  for (const f of ['Config.gs', 'NotesRepository.gs']) loadGasFile(ctx, f);
  ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', 'FOLDER1');
  return ctx;
}

test('the hub notes reader throws on a Meeting Notes Doc with a second tab', () => {
  const ctx = repoCtx();
  const docId = ctx.DPNotesRepo.ensureNotesDoc('NCMMS_CORE');
  assert.doesNotThrow(() => ctx.DPNotesRepo.readDocModel(docId));
  ctx.__fakes.docs[docId].extraTabs = 1;
  assert.throws(() => ctx.DPNotesRepo.readDocModel(docId), /2 tabs/);
});
