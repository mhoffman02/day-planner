/**
 * @file forwardDailyTaskCompensation.test.js
 * @description gas-app/Code.gs forwardDailyTask must be a compensating two-step write, run against the
 * REAL file in a vm with GAS stubs. Diagnosed bug (2026-10-09): it marked the source task "→" FIRST and
 * then created the target-day copy, so a failed create left the task marked forwarded with no copy
 * anywhere (silent data loss). Now: create the copy first, then mark; if marking fails, delete the copy
 * and say nothing was forwarded; if that delete also fails, say the task may be duplicated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';

const SRC = '2026-10-09';
const DST = '2026-10-10';

function forwardCtx() {
  const ctx = makeGasContext();
  ctx.Utilities.formatDate = () => '2026-10-09 12:00:00';
  loadGasFile(ctx, 'Code.gs');
  const calls = [];
  const T = ctx.Tasks.Tasks;
  const origInsert = T.insert.bind(T);
  const origPatch = T.patch.bind(T);
  T.insert = (res, list) => { calls.push('insert'); return origInsert(res, list); };
  T.patch = (patch, list, id) => { calls.push('patch:' + id); return origPatch(patch, list, id); };
  // Real Advanced Service signature: Tasks.Tasks.remove(tasklist, taskId).
  T.remove = (list, id) => {
    calls.push('remove:' + id);
    const i = ctx.__fakes.tasks.findIndex((t) => t.id === id);
    if (i < 0) { const e = new Error('404 Not Found'); e.code = 404; throw e; }
    ctx.__fakes.tasks.splice(i, 1);
  };
  ctx.__fakes.tasks.push({ id: 'SRC1', title: '[B3] Call vendor', status: 'needsAction', due: SRC + 'T00:00:00.000Z', notes: '' });
  return { ctx, calls, T };
}

const src = (ctx) => ctx.__fakes.tasks.find((t) => t.id === 'SRC1');
const onTarget = (ctx) => ctx.__fakes.tasks.filter((t) => t.due && t.due.slice(0, 10) === DST);
const consoleText = (ctx) => ctx.__consoleLines.join('\n');

test('happy path: creates the target-day copy BEFORE marking the source, return shape unchanged', () => {
  const { ctx, calls } = forwardCtx();
  const out = toHost(ctx.forwardDailyTask(SRC, 'SRC1', DST));
  assert.deepEqual(Object.keys(out).sort(), ['forwardedTask', 'originalTask']);
  assert.equal(out.originalTask.id, 'SRC1');
  assert.equal(out.originalTask.status, '→');
  assert.equal(out.forwardedTask.title, '[B1] Call vendor');
  assert.equal(out.forwardedTask.dueDate, DST);
  assert.equal(onTarget(ctx).length, 1);
  assert.ok(calls.indexOf('insert') >= 0 && calls.indexOf('insert') < calls.indexOf('patch:SRC1'), `order: ${calls.join(',')}`);
});

test('create fails: the source is NOT marked forwarded (no silent data loss)', () => {
  const { ctx, calls, T } = forwardCtx();
  T.insert = () => { calls.push('insert'); throw new Error('Tasks insert 500'); };
  assert.throws(() => ctx.forwardDailyTask(SRC, 'SRC1', DST), /Tasks insert 500/);
  assert.ok(!calls.some((c) => c.startsWith('patch:')), `source was patched: ${calls.join(',')}`);
  assert.doesNotMatch(String(src(ctx).notes), /→/);
  assert.equal(src(ctx).status, 'needsAction');
});

test('marking fails: the new copy is deleted and the error says nothing was forwarded', () => {
  const { ctx, calls, T } = forwardCtx();
  T.patch = (p, l, id) => { calls.push('patch:' + id); throw new Error('Tasks patch 503'); };
  assert.throws(() => ctx.forwardDailyTask(SRC, 'SRC1', DST), (err) => {
    assert.match(err.message, /nothing was forwarded/i);
    assert.match(err.message, /Tasks patch 503/);
    assert.doesNotMatch(err.message, /\n\s+at /, 'stack leaked into user-facing message');
    return true;
  });
  assert.equal(onTarget(ctx).length, 0, 'compensating delete did not remove the copy');
  assert.ok(calls.some((c) => c.startsWith('remove:')), `no remove: ${calls.join(',')}`);
  assert.match(consoleText(ctx), /Tasks patch 503[\s\S]*\n\s+at /, 'mark failure stack not logged');
});

test('marking hits a 404 (source deleted mid-forward): treated as failure, copy deleted', () => {
  const { ctx, T } = forwardCtx();
  T.patch = () => { throw new Error('API call to tasks.tasks.patch failed with error: 404 Not Found'); };
  assert.throws(() => ctx.forwardDailyTask(SRC, 'SRC1', DST), /nothing was forwarded/i);
  assert.equal(onTarget(ctx).length, 0);
});

test('marking fails AND the compensating delete fails: error says the task may be duplicated on targetDate', () => {
  const { ctx, T } = forwardCtx();
  T.patch = () => { throw new Error('Tasks patch 503'); };
  T.remove = () => { throw new Error('Tasks remove 500'); };
  assert.throws(() => ctx.forwardDailyTask(SRC, 'SRC1', DST), (err) => {
    assert.match(err.message, new RegExp(`may be duplicated on ${DST}`));
    assert.doesNotMatch(err.message, /nothing was forwarded/i);
    return true;
  });
  const log = consoleText(ctx);
  assert.match(log, /Tasks patch 503[\s\S]*\n\s+at /, 'mark failure stack not logged');
  assert.match(log, /Tasks remove 500[\s\S]*\n\s+at /, 'rollback failure stack not logged');
});
