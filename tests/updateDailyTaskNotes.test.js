/**
 * @file updateDailyTaskNotes.test.js
 * @description gas-app/Code.gs updateDailyTask must persist updates.notes, run against the REAL file in
 * a vm with GAS stubs. Diagnosed bug (2026-10-10): updateDailyTask had no notes branch, so a notes edit
 * sent with a title edit was acknowledged as saved but never written to Google (silent data loss).
 * The client sends notes WITHOUT the hidden dp markers, so the server must keep the task's existing
 * status/meta markers (including hub provenance such as opKey) and must not let typed markers in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';

const DAY = '2026-10-10';
const RAW = 'old text\n\n[Category: Work] [Starred]\n<!--dp-meta:{"opKey":"op-1"}-->\n\n[Status: X]';

function ctxWithTask(notes) {
  const ctx = makeGasContext();
  loadGasFile(ctx, 'Code.gs');
  ctx.__fakes.tasks.push({ id: 'T1', title: '[A1] Draft memo', status: 'needsAction', due: DAY + 'T00:00:00.000Z', notes });
  return ctx;
}
const stored = (ctx) => ctx.__fakes.tasks.find((t) => t.id === 'T1').notes;

test('notes edit is written to Google, keeping status and meta markers', () => {
  const ctx = ctxWithTask(RAW);
  const out = toHost(ctx.updateDailyTask(DAY, 'T1', { title: '[A1] Draft memo', notes: 'new text' }));
  const notes = stored(ctx);
  assert.match(notes, /^new text/);
  assert.doesNotMatch(notes, /old text/);
  assert.match(notes, /\[Category: Work\]/);
  assert.match(notes, /\[Starred\]/);
  assert.match(notes, /"opKey":"op-1"/);
  assert.match(notes, /\[Status: X\]/);
  assert.equal(out.notes, 'new text');
});

test('markers typed into the notes text cannot forge metadata', () => {
  const ctx = ctxWithTask('');
  ctx.updateDailyTask(DAY, 'T1', { notes: 'hi [Starred] [Category: Evil]' });
  const notes = stored(ctx);
  assert.doesNotMatch(notes, /Starred|Evil/);
  assert.match(notes, /^hi/);
});

test('notes plus status in one update: both land', () => {
  const ctx = ctxWithTask(RAW);
  ctx.updateDailyTask(DAY, 'T1', { notes: 'new text', status: '○' });
  const notes = stored(ctx);
  assert.match(notes, /^new text/);
  assert.match(notes, /\[Status: ○\]/);
  assert.doesNotMatch(notes, /\[Status: X\]/);
  assert.match(notes, /"opKey":"op-1"/);
});

test('clearing notes to empty keeps the markers', () => {
  const ctx = ctxWithTask(RAW);
  ctx.updateDailyTask(DAY, 'T1', { notes: '' });
  const notes = stored(ctx);
  assert.doesNotMatch(notes, /old text/);
  assert.match(notes, /\[Category: Work\]/);
  assert.match(notes, /\[Status: X\]/);
});
