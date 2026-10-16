/**
 * @file forwardMasterTaskServer.test.js
 * @description gas-app/Code.gs forwardMasterTask and undoMasterForward, run against the REAL file in
 * a vm with GAS stubs. Forwarding an undated master task is a compensating two-step write: the daily
 * copy (linked back by sourceMasterId, keeping the master's priority group) is created FIRST, then
 * the master is marked → with movedTo/movedTaskId. Undo deletes the copy, then clears the move.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';

const DST = '2026-10-12';

function masterCtx(notes = '[Master]') {
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
  ctx.__fakes.tasks.push({ id: 'M1', title: '[C2] Plan offsite', status: 'needsAction', notes });
  return { ctx, calls, T };
}

const master = (ctx) => ctx.__fakes.tasks.find((t) => t.id === 'M1');
const onTarget = (ctx) => ctx.__fakes.tasks.filter((t) => t.due && t.due.slice(0, 10) === DST);

test('forwardMasterTask: linked copy first (priority group kept), then the master is → with the move recorded', () => {
  const { ctx, calls } = masterCtx();
  const out = toHost(ctx.forwardMasterTask('M1', DST));
  assert.equal(out.forwardedTask.title, '[C1] Plan offsite');
  assert.equal(out.forwardedTask.dueDate, DST);
  assert.equal(out.forwardedTask.sourceMasterId, 'M1');
  assert.equal(out.originalTask.status, '→');
  assert.ok(calls.indexOf('insert') < calls.indexOf('patch:M1'), `order: ${calls.join(',')}`);
  const notes = master(ctx).notes;
  assert.match(notes, new RegExp(`\\[MovedTo: ${DST}, id: ${out.forwardedTask.id}\\]`));
  assert.match(notes, /\[Master\]/);
});

test('forwardMasterTask: a failed mark deletes the copy and says nothing was forwarded', () => {
  const { ctx, T } = masterCtx();
  T.patch = () => { throw new Error('Tasks patch 503'); };
  assert.throws(() => ctx.forwardMasterTask('M1', DST), /nothing was forwarded/i);
  assert.equal(onTarget(ctx).length, 0);
});

test('forwardMasterTask: a bad date is rejected before anything is written', () => {
  const { ctx, calls } = masterCtx();
  assert.throws(() => ctx.forwardMasterTask('M1', 'tomorrow'), /YYYY-MM-DD/);
  assert.deepEqual(calls, []);
});

test('undoMasterForward: deletes the copy, then clears the move and restores the earlier status', () => {
  const { ctx, calls } = masterCtx();
  const fwd = toHost(ctx.forwardMasterTask('M1', DST));
  calls.length = 0;
  const out = toHost(ctx.undoMasterForward('M1', fwd.forwardedTask.id, '○'));
  assert.equal(calls[0], 'remove:' + fwd.forwardedTask.id);
  assert.equal(out.status, '○');
  assert.equal(out.movedTo, null);
  const notes = master(ctx).notes;
  assert.doesNotMatch(notes, /MovedTo/);
  assert.match(notes, /\[Master\]/);
  assert.equal(onTarget(ctx).length, 0);
});

test('undoMasterForward: a failed delete leaves the forward in place and throws', () => {
  const { ctx, T } = masterCtx();
  const fwd = toHost(ctx.forwardMasterTask('M1', DST));
  T.remove = () => { throw new Error('Tasks remove 500'); };
  assert.throws(() => ctx.undoMasterForward('M1', fwd.forwardedTask.id, '•'), /Tasks remove 500/);
  assert.match(master(ctx).notes, /MovedTo/);
});

test('both RPCs have top-level delegators for google.script.run', async () => {
  const fs = await import('node:fs');
  const code = fs.readFileSync(new URL('../gas-app/Code.gs', import.meta.url), 'utf8');
  for (const name of ['forwardMasterTask', 'undoMasterForward']) {
    assert.equal((code.match(new RegExp(`^function ${name}\\(`, 'gm')) || []).length, 2, name);
    assert.match(code, new RegExp(`global\\._${name}Internal = ${name};`));
  }
});
