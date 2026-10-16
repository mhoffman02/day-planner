/**
 * @file delegateDailyTaskServer.test.js
 * @description gas-app/Code.gs delegateDailyTask, run against the REAL file in a vm with GAS stubs:
 * an open "Check back" task on the check-back day (owner in its title, original priority group),
 * then the source marked Ⓓ with the owner and day kept as hidden waitingOn/nagDate meta. Same
 * compensating two-step write as forwardDailyTask: a failed mark deletes the follow-up.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';

const SRC = '2026-10-09';
const DST = '2026-10-12';

function delegateCtx() {
  const ctx = makeGasContext();
  ctx.Utilities.formatDate = () => '2026-10-09 12:00:00';
  loadGasFile(ctx, 'Code.gs');
  const calls = [];
  const T = ctx.Tasks.Tasks;
  const origInsert = T.insert.bind(T);
  const origPatch = T.patch.bind(T);
  T.insert = (res, list) => { calls.push('insert'); return origInsert(res, list); };
  T.patch = (patch, list, id) => { calls.push('patch:' + id); return origPatch(patch, list, id); };
  T.remove = (list, id) => {
    calls.push('remove:' + id);
    const i = ctx.__fakes.tasks.findIndex((t) => t.id === id);
    if (i < 0) { const e = new Error('404 Not Found'); e.code = 404; throw e; }
    ctx.__fakes.tasks.splice(i, 1);
  };
  ctx.__fakes.tasks.push({ id: 'SRC1', title: '[B3] Call vendor', status: 'needsAction', due: SRC + 'T00:00:00.000Z', notes: 'Ask about Q4 pricing' });
  return { ctx, calls, T };
}

const src = (ctx) => ctx.__fakes.tasks.find((t) => t.id === 'SRC1');
// Hidden hub-style meta lives in the dp-meta JSON marker at the end of the notes.
const metaOf = (notes) => JSON.parse((String(notes).match(/<!--dp-meta:(.*?)-->/) || [null, '{}'])[1]);
const onTarget = (ctx) => ctx.__fakes.tasks.filter((t) => t.due && t.due.slice(0, 10) === DST);

test('happy path: check-back task first, then the source is Ⓓ with owner and day in hidden meta', () => {
  const { ctx, calls } = delegateCtx();
  const out = toHost(ctx.delegateDailyTask(SRC, 'SRC1', DST, 'Pat Lee'));
  assert.equal(out.originalTask.status, 'Ⓓ');
  assert.equal(out.followUpTask.title, '[B1] Check back: Call vendor (Pat Lee)');
  assert.equal(out.followUpTask.status, '•');
  assert.equal(out.followUpTask.dueDate, DST);
  assert.equal(onTarget(ctx).length, 1);
  assert.ok(calls.indexOf('insert') < calls.indexOf('patch:SRC1'), `order: ${calls.join(',')}`);
  const meta = metaOf(src(ctx).notes);
  assert.equal(meta.waitingOn, 'Pat Lee');
  assert.equal(meta.nagDate, DST);
  assert.equal(out.originalTask.notes, 'Ask about Q4 pricing', 'meta must not show in the notes text');
});

test('no owner: the title has no suffix and no waitingOn is stored', () => {
  const { ctx } = delegateCtx();
  const out = toHost(ctx.delegateDailyTask(SRC, 'SRC1', DST, ''));
  assert.equal(out.followUpTask.title, '[B1] Check back: Call vendor');
  const meta = metaOf(src(ctx).notes);
  assert.equal(meta.waitingOn, undefined);
  assert.equal(meta.nagDate, DST);
});

test('owner text is cleaned on the server too (brackets, length)', () => {
  const { ctx } = delegateCtx();
  const out = toHost(ctx.delegateDailyTask(SRC, 'SRC1', DST, '[Pat] ' + 'x'.repeat(100)));
  assert.doesNotMatch(out.followUpTask.title, /\[Pat\]/);
  assert.ok(out.followUpTask.title.length < 120, out.followUpTask.title);
});

test('a bad check-back date is rejected before anything is written', () => {
  const { ctx, calls } = delegateCtx();
  assert.throws(() => ctx.delegateDailyTask(SRC, 'SRC1', '10/12/2026', 'Pat'), /check-back date/i);
  assert.deepEqual(calls, []);
});

test('marking fails: the follow-up is deleted and the error says nothing was delegated', () => {
  const { ctx, T } = delegateCtx();
  T.patch = () => { throw new Error('Tasks patch 503'); };
  assert.throws(() => ctx.delegateDailyTask(SRC, 'SRC1', DST, 'Pat'), /nothing was delegated/i);
  assert.equal(onTarget(ctx).length, 0);
});

test('marking and the compensating delete both fail: the error says it may be duplicated', () => {
  const { ctx, T } = delegateCtx();
  T.patch = () => { throw new Error('Tasks patch 503'); };
  T.remove = () => { throw new Error('Tasks remove 500'); };
  assert.throws(() => ctx.delegateDailyTask(SRC, 'SRC1', DST, 'Pat'), new RegExp(`may be duplicated on ${DST}`));
});

test('the RPC has a top-level delegator for google.script.run', async () => {
  const fs = await import('node:fs');
  const code = fs.readFileSync(new URL('../gas-app/Code.gs', import.meta.url), 'utf8');
  assert.equal((code.match(/^function delegateDailyTask\(/gm) || []).length, 2);
  assert.match(code, /global\._delegateDailyTaskInternal = delegateDailyTask;/);
});
