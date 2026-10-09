/**
 * @file hubNotesRepo.test.js
 * @description vm tests for gas-app/NotesRepository.gs (DPNotesRepo) against faithful Sheets/Drive/Docs fakes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadEngines, loadGasFile, toHost, fakeDocText, fakeDocParagraphs } from './helpers/gasRuntimeStubs.js';

const OCC = { occurrenceId: 'EVT_20261006', date: '2026-10-06', displayName: 'NCMMS Core Team' };
const CARRY = { threadId: 'thr1', subject: 'Budget question', gmailUrl: 'https://mail.google.com/mail/u/0/#all/thr1', fromName: 'Pat', receivedDate: '2026-10-05', framing: 'Please decide' };

function setup() {
  const ctx = makeGasContext();
  loadEngines(ctx);
  for (const f of ['Config.gs', 'NotesRepository.gs']) loadGasFile(ctx, f);
  ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', 'FOLDER1');
  return ctx;
}

function plan(ctx, docId, carryIn, carryOcc = OCC) {
  const model = ctx.DPNotesRepo.readDocModel(docId);
  return carryIn ? ctx.DPEngines.planCarryIn(model, carryOcc, carryIn) : ctx.DPEngines.planOccurrenceSection(model, carryOcc);
}

test('(h) ensureNotesDoc twice => one Doc, id recorded in the registry, titled per series', () => {
  const ctx = setup();
  const a = ctx.DPNotesRepo.ensureNotesDoc('NCMMS_CORE');
  const b = ctx.DPNotesRepo.ensureNotesDoc('NCMMS_CORE');
  assert.equal(a, b);
  const docs = ctx.__fakes.driveFiles.filter((f) => f.mimeType.endsWith('document'));
  assert.equal(docs.length, 1);
  assert.equal(docs[0].title, 'Meeting Notes – NCMMS Core Team');
  assert.deepEqual(toHost(docs[0].parents), [{ id: 'FOLDER1' }]);
  const row = ctx.DPConfig.getRegistry().find((r) => r.SeriesKey === 'NCMMS_CORE');
  assert.equal(row.HumanNotesDocId, a);
  assert.notEqual(ctx.DPNotesRepo.ensureNotesDoc('NCMMS_DAILY'), a);
  assert.throws(() => ctx.DPNotesRepo.ensureNotesDoc('NOPE'), (e) => e.message.startsWith('SETUP_ERROR:'));
});

test('(h) ensureNotesDoc adopts an orphan Doc left by a crash before the registry write', () => {
  const ctx = setup();
  const orphan = ctx.Drive.Files.insert({ title: 'Meeting Notes – NCMMS Core Team', mimeType: 'application/vnd.google-apps.document', parents: [{ id: 'FOLDER1' }] });
  assert.equal(ctx.DPNotesRepo.ensureNotesDoc('NCMMS_CORE'), orphan.id);
  assert.equal(ctx.__fakes.driveFiles.filter((f) => f.mimeType.endsWith('document')).length, 1);
});

test('(h) applyPlan on an empty doc creates the skeleton at correct indices, styles and text', () => {
  const ctx = setup();
  const docId = ctx.DPNotesRepo.ensureNotesDoc('NCMMS_CORE');
  const res = ctx.DPNotesRepo.applyPlan(docId, plan(ctx, docId));
  assert.ok(res.applied > 0);
  const paras = fakeDocParagraphs(ctx.__fakes.docs[docId]);
  const texts = paras.map((p) => p.text);
  assert.deepEqual(toHost(texts), ['', '2026-10-06 — NCMMS Core Team', 'PREP / EMAIL CARRY-INS', '', 'AGENDA', '', 'HUMAN NOTES', '', 'DECISIONS', '', 'ACTION ITEMS', '', 'GEMINI RECONCILIATION', '']);
  assert.equal(paras[1].style, 'HEADING_2');
  assert.equal(paras[2].style, 'HEADING_3');
  assert.equal(paras[3].style, 'NORMAL_TEXT');
  assert.equal(plan(ctx, docId).status, 'EXISTS'); // re-read doc matches planned shape
  assert.equal(ctx.DPNotesRepo.applyPlan(docId, plan(ctx, docId)).applied, 0);
});

test('(h) a second occurrence is inserted correctly after existing content (mid and end offsets)', () => {
  const ctx = setup();
  const docId = ctx.DPNotesRepo.ensureNotesDoc('NCMMS_CORE');
  ctx.DPNotesRepo.applyPlan(docId, plan(ctx, docId));
  const occ2 = { occurrenceId: 'EVT_20261013', date: '2026-10-13', displayName: 'NCMMS Core Team' };
  ctx.DPNotesRepo.applyPlan(docId, plan(ctx, docId, null, occ2));
  ctx.DPNotesRepo.applyPlan(docId, plan(ctx, docId, CARRY)); // first occurrence block, not at doc end
  const paras = fakeDocParagraphs(ctx.__fakes.docs[docId]);
  const i1 = paras.findIndex((p) => p.text === '2026-10-06 — NCMMS Core Team');
  const i2 = paras.findIndex((p) => p.text === '2026-10-13 — NCMMS Core Team');
  const ic = paras.findIndex((p) => p.text.includes('Budget question'));
  assert.ok(i1 < ic && ic < i2, `carry-in belongs to the first occurrence (${i1} < ${ic} < ${i2})`);
  assert.equal(ctx.DPNotesRepo.carryInCount(docId, OCC), 1);
  assert.equal(ctx.DPNotesRepo.carryInCount(docId, occ2), 0);
  assert.equal(paras[i2].style, 'HEADING_2');
  assert.equal(paras[ic].style, 'NORMAL_TEXT');
});

test('(h) rerun 3x => carry-in appears once, with a working link and sections intact', () => {
  const ctx = setup();
  const docId = ctx.DPNotesRepo.ensureNotesDoc('NCMMS_CORE');
  const actions = [];
  for (let i = 0; i < 3; i += 1) {
    const p = plan(ctx, docId, CARRY);
    actions.push(p.action);
    ctx.DPNotesRepo.applyPlan(docId, p);
  }
  assert.deepEqual(actions, ['APPEND', 'ALREADY_PRESENT', 'ALREADY_PRESENT']);
  const doc = ctx.__fakes.docs[docId];
  const text = fakeDocText(doc);
  assert.equal(text.split('Budget question').length - 1, 1);
  assert.equal(text.split('PREP / EMAIL CARRY-INS').length - 1, 1);
  const paras = fakeDocParagraphs(doc);
  const linkPara = paras.find((p) => p.links.length);
  assert.equal(linkPara.links.length, 1);
  assert.equal(linkPara.links[0].url, CARRY.gmailUrl);
  assert.equal(linkPara.text.slice(linkPara.links[0].start, linkPara.links[0].end), 'Gmail');
  assert.equal(ctx.DPNotesRepo.carryInCount(docId, OCC), 1);
  const i = paras.findIndex((p) => p.text === 'PREP / EMAIL CARRY-INS');
  assert.ok(paras[i + 1].text.startsWith('• [Decision/Input needed]'));
  assert.equal(paras[i + 1].style, 'NORMAL_TEXT');
});

test('(h) a second carry-in lands after the first; inserted text does not inherit the link', () => {
  const ctx = setup();
  const docId = ctx.DPNotesRepo.ensureNotesDoc('NCMMS_CORE');
  ctx.DPNotesRepo.applyPlan(docId, plan(ctx, docId, CARRY));
  ctx.DPNotesRepo.applyPlan(docId, plan(ctx, docId, { ...CARRY, threadId: 'thr2', subject: 'Second topic', gmailUrl: 'https://mail.google.com/mail/u/0/#all/thr2' }));
  assert.equal(ctx.DPNotesRepo.carryInCount(docId, OCC), 2);
  const paras = fakeDocParagraphs(ctx.__fakes.docs[docId]);
  assert.ok(paras.findIndex((p) => p.text.includes('Budget question')) < paras.findIndex((p) => p.text.includes('Second topic')));
  const linked = paras.filter((p) => p.links.length);
  assert.equal(linked.length, 2);
  for (const p of linked) assert.equal(p.text.slice(p.links[0].start, p.links[0].end), 'Gmail');
  assert.ok(paras.filter((p) => /^(AGENDA|HUMAN NOTES|DECISIONS)$/.test(p.text)).every((p) => p.links.length === 0));
});

test('(h) astral characters: UTF-16 indices stay correct', () => {
  const ctx = setup();
  const docId = ctx.DPNotesRepo.ensureNotesDoc('NCMMS_CORE');
  ctx.DPNotesRepo.applyPlan(docId, plan(ctx, docId, { ...CARRY, subject: 'Launch 🚀 plan' }));
  ctx.DPNotesRepo.applyPlan(docId, plan(ctx, docId, { ...CARRY, threadId: 'thr3', subject: 'After emoji', gmailUrl: 'https://mail.google.com/mail/u/0/#all/thr3' }));
  const paras = fakeDocParagraphs(ctx.__fakes.docs[docId]);
  const linked = paras.filter((p) => p.links.length);
  assert.equal(linked.length, 2);
  for (const p of linked) assert.equal(p.text.slice(p.links[0].start, p.links[0].end), 'Gmail');
  assert.equal(ctx.DPNotesRepo.carryInCount(docId, OCC), 2);
});

test('(h) DOC_INACCESSIBLE: read and apply throw a retryable error and leave the doc unchanged', () => {
  const ctx = setup();
  const docId = ctx.DPNotesRepo.ensureNotesDoc('NCMMS_CORE');
  ctx.DPNotesRepo.applyPlan(docId, plan(ctx, docId));
  const p = plan(ctx, docId, CARRY);
  const snapshot = fakeDocText(ctx.__fakes.docs[docId]);
  const revision = ctx.__fakes.docs[docId].revisionId;
  ctx.__fakes.inaccessibleDocs.add(docId);
  for (const fn of [() => ctx.DPNotesRepo.readDocModel(docId), () => ctx.DPNotesRepo.applyPlan(docId, p)]) {
    assert.throws(fn, (e) => e.code === 'DOC_INACCESSIBLE' && e.retryable === true);
  }
  ctx.__fakes.inaccessibleDocs.delete(docId);
  assert.equal(fakeDocText(ctx.__fakes.docs[docId]), snapshot);
  assert.equal(ctx.__fakes.docs[docId].revisionId, revision);
});

test('(h) DOC_INACCESSIBLE raised by batchUpdate itself (permission revoked mid-flight) leaves the doc unchanged', () => {
  const ctx = setup();
  const docId = ctx.DPNotesRepo.ensureNotesDoc('NCMMS_CORE');
  const p = plan(ctx, docId);
  const snapshot = fakeDocText(ctx.__fakes.docs[docId]);
  const real = ctx.Docs.Documents.batchUpdate;
  ctx.Docs.Documents.batchUpdate = () => { const e = new Error('The caller does not have permission'); e.code = 403; throw e; };
  assert.throws(() => ctx.DPNotesRepo.applyPlan(docId, p), (e) => e.code === 'DOC_INACCESSIBLE' && e.retryable === true);
  ctx.Docs.Documents.batchUpdate = real;
  assert.equal(fakeDocText(ctx.__fakes.docs[docId]), snapshot);
});

test('other batchUpdate failures surface as retryable DOC_WRITE_FAILED', () => {
  const ctx = setup();
  const docId = ctx.DPNotesRepo.ensureNotesDoc('NCMMS_CORE');
  const p = plan(ctx, docId);
  ctx.Docs.Documents.batchUpdate = () => { throw new Error('Internal error'); };
  assert.throws(() => ctx.DPNotesRepo.applyPlan(docId, p), (e) => e.code === 'DOC_WRITE_FAILED' && e.retryable === true);
});

test('stale plan: DOC_CONFLICT when the doc changed since the model, no write', () => {
  const ctx = setup();
  const docId = ctx.DPNotesRepo.ensureNotesDoc('NCMMS_CORE');
  const model = ctx.DPNotesRepo.readDocModel(docId);
  const stale = { ...ctx.DPEngines.planOccurrenceSection(model, OCC), baseRevisionId: model.revisionId };
  ctx.Docs.Documents.batchUpdate({ requests: [{ insertText: { location: { index: 1 }, text: 'x' } }] }, docId);
  const text = fakeDocText(ctx.__fakes.docs[docId]);
  assert.throws(() => ctx.DPNotesRepo.applyPlan(docId, stale), (e) => e.code === 'DOC_CONFLICT' && e.retryable === true);
  assert.equal(fakeDocText(ctx.__fakes.docs[docId]), text);
});

test('unknown planner request types are rejected before any write', () => {
  const ctx = setup();
  const docId = ctx.DPNotesRepo.ensureNotesDoc('NCMMS_CORE');
  const text = fakeDocText(ctx.__fakes.docs[docId]);
  assert.throws(() => ctx.DPNotesRepo.applyPlan(docId, { requests: [{ type: 'DELETE_ALL' }] }), /unsupported planner request/);
  assert.equal(fakeDocText(ctx.__fakes.docs[docId]), text);
});

test('carryInCount rejects a bare occurrenceId instead of guessing', () => {
  const ctx = setup();
  const docId = ctx.DPNotesRepo.ensureNotesDoc('NCMMS_CORE');
  assert.throws(() => ctx.DPNotesRepo.carryInCount(docId, 'EVT_1'), /occurrence object/);
});
