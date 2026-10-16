/**
 * @file masterParityClearinghouse.test.js
 * @description What the Master Tasks list shows on reload after a forward or delegate, end to end:
 * the REAL gas-app/Code.gs write (forwardMasterTask, forwardDailyTask, delegateDailyTask) runs
 * against faked Google Tasks, then the REAL getMasterTasks reads the list back. The client sets
 * these same end states on screen right after a write (see masterTaskParity.test.js), so a reload
 * never changes what a row shows.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';

const D0 = '2026-10-09';
const D1 = '2026-10-12';

function ctxWith(tasks) {
  const ctx = makeGasContext();
  ctx.Utilities.formatDate = () => '2026-10-09 12:00:00';
  loadGasFile(ctx, 'Code.gs');
  ctx.Tasks.Tasks.remove = (list, id) => {
    const i = ctx.__fakes.tasks.findIndex((t) => t.id === id);
    if (i >= 0) ctx.__fakes.tasks.splice(i, 1);
  };
  tasks.forEach((t) => ctx.__fakes.tasks.push({ status: 'needsAction', notes: '', ...t }));
  return ctx;
}

const list = (ctx) => toHost(ctx.getMasterTasks(''));
const row = (rows, id) => rows.find((r) => r.id === id);

describe('Master list on reload after forward and delegate (real server)', () => {
  it('undated master, forwarded: one row on the new day, open (the copy is the live task)', () => {
    const ctx = ctxWith([{ id: 'M', title: '[B1] Call vendor', notes: '[Master]' }]);
    const fwd = toHost(ctx.forwardMasterTask('M', D1));
    const rows = list(ctx);
    assert.equal(rows.length, 1);
    assert.deepEqual({ id: rows[0].id, status: rows[0].status, dueDate: rows[0].dueDate, movedTaskId: rows[0].movedTaskId },
      { id: 'M', status: '•', dueDate: D1, movedTaskId: fwd.forwardedTask.id });
  });

  it('undated master, delegated: the master stays as Ⓓ, plus an open check-back row', () => {
    const ctx = ctxWith([{ id: 'M', title: '[B1] Call vendor', notes: '[Master]' }]);
    const del = toHost(ctx.delegateDailyTask('', 'M', D1, 'Pat'));
    const rows = list(ctx);
    assert.equal(row(rows, 'M').status, 'Ⓓ');
    assert.equal(row(rows, del.followUpTask.id).status, '•');
    assert.equal(row(rows, del.followUpTask.id).dueDate, D1);
  });

  it('scheduled pair, forwarded: the pair shows → on its old day, plus the new copy', () => {
    const ctx = ctxWith([{ id: 'M', title: '[B1] Call vendor', notes: '[Master]' }]);
    const first = toHost(ctx.forwardMasterTask('M', D0));
    const fwd = toHost(ctx.forwardDailyTask(D0, first.forwardedTask.id, D1));
    const rows = list(ctx);
    assert.equal(rows.length, 2);
    assert.deepEqual({ status: row(rows, 'M').status, dueDate: row(rows, 'M').dueDate }, { status: '→', dueDate: D0 });
    assert.equal(row(rows, fwd.forwardedTask.id).dueDate, D1);
  });

  it('scheduled pair, delegated: the pair shows Ⓓ, plus an open check-back row', () => {
    const ctx = ctxWith([{ id: 'M', title: '[B1] Call vendor', notes: '[Master]' }]);
    const first = toHost(ctx.forwardMasterTask('M', D0));
    const del = toHost(ctx.delegateDailyTask(D0, first.forwardedTask.id, D1, ''));
    const rows = list(ctx);
    assert.equal(row(rows, 'M').status, 'Ⓓ');
    assert.equal(row(rows, del.followUpTask.id).status, '•');
  });

  it('dated task with no master, forwarded: stays listed as →, plus the new copy', () => {
    const ctx = ctxWith([{ id: 'T', title: '[B1] Call vendor', due: D0 + 'T00:00:00.000Z' }]);
    const fwd = toHost(ctx.forwardDailyTask(D0, 'T', D1));
    const rows = list(ctx);
    assert.equal(row(rows, 'T').status, '→');
    assert.ok(row(rows, fwd.forwardedTask.id));
  });

  it('dated task with no master, delegated: it leaves the list (completed in Google), the check-back row stays', () => {
    const ctx = ctxWith([{ id: 'T', title: '[B1] Call vendor', due: D0 + 'T00:00:00.000Z' }]);
    const del = toHost(ctx.delegateDailyTask(D0, 'T', D1, ''));
    const rows = list(ctx);
    assert.equal(row(rows, 'T'), undefined);
    assert.equal(row(rows, del.followUpTask.id).status, '•');
  });
});
