/**
 * @file masterParityClearinghouse.test.js
 * @description What the Master Tasks list shows after a forward or delegate from a Master row, by
 * running the Google state each write leaves through buildMasterTasksClearinghouse (the same
 * function the server and the reload use). The client sets these same end states on screen right
 * after a write, so a reload never changes what the row shows.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterTasksClearinghouse } from '../src/taskEngine.js';

const D0 = '2031-03-12';
const D1 = '2031-03-13';

// Decoded task shape that getMasterTasks hands to the clearinghouse.
function g(id, fields = {}) {
  return { id, title: fields.title || '[B1] Call vendor', category: 'Work', status: '•', starred: false, notes: '', due: null, movedTo: null, movedTaskId: null, sourceMasterId: null, statusRaw: 'needsAction', ...fields };
}
const row = (list, id) => list.find((r) => r.id === id);

describe('Master row end states after forward and delegate', () => {
  it('undated master, forwarded: one row on the new day, open (the copy is the live task)', () => {
    const out = buildMasterTasksClearinghouse([
      g('M', { status: '→', movedTo: D1, movedTaskId: 'C' }),
      g('C', { due: D1 + 'T00:00:00.000Z', sourceMasterId: 'M' })
    ]);
    assert.equal(out.length, 1);
    assert.deepEqual({ id: out[0].id, status: out[0].status, dueDate: out[0].dueDate, movedTaskId: out[0].movedTaskId }, { id: 'M', status: '•', dueDate: D1, movedTaskId: 'C' });
  });

  it('undated master, delegated: the master shows Ⓓ (undated stays listed) plus an open check-back row', () => {
    const out = buildMasterTasksClearinghouse([
      g('M', { status: 'Ⓓ', statusRaw: 'completed' }),
      g('K', { title: '[B1] Check back: Call vendor (Pat)', due: D1 + 'T00:00:00.000Z' })
    ]);
    assert.equal(row(out, 'M').status, 'Ⓓ');
    assert.equal(row(out, 'M').dueDate, null);
    assert.equal(row(out, 'K').status, '•');
    assert.equal(row(out, 'K').dueDate, D1);
  });

  it('scheduled pair, forwarded: the pair shows → on its old day, plus the new copy as its own row', () => {
    const out = buildMasterTasksClearinghouse([
      g('M', { status: '→', movedTo: D0, movedTaskId: 'C' }),
      g('C', { status: '→', due: D0 + 'T00:00:00.000Z', sourceMasterId: 'M' }),
      g('C1', { due: D1 + 'T00:00:00.000Z' })
    ]);
    assert.equal(out.length, 2);
    assert.deepEqual({ status: row(out, 'M').status, dueDate: row(out, 'M').dueDate }, { status: '→', dueDate: D0 });
    assert.equal(row(out, 'C1').dueDate, D1);
  });

  it('scheduled pair, delegated: the pair shows Ⓓ, plus an open check-back row', () => {
    const out = buildMasterTasksClearinghouse([
      g('M', { status: 'Ⓓ', statusRaw: 'completed', movedTo: D0, movedTaskId: 'C' }),
      g('C', { status: 'Ⓓ', statusRaw: 'completed', due: D0 + 'T00:00:00.000Z', sourceMasterId: 'M' }),
      g('K', { due: D1 + 'T00:00:00.000Z' })
    ]);
    assert.equal(row(out, 'M').status, 'Ⓓ');
    assert.equal(row(out, 'K').status, '•');
  });

  it('dated task with no master, forwarded or delegated: stays listed with its glyph, new row added', () => {
    const fwd = buildMasterTasksClearinghouse([g('T', { status: '→', due: D0 + 'T00:00:00.000Z' }), g('C1', { due: D1 + 'T00:00:00.000Z' })]);
    assert.equal(row(fwd, 'T').status, '→');
    assert.ok(row(fwd, 'C1'));
    const del = buildMasterTasksClearinghouse([g('T', { status: 'Ⓓ', statusRaw: 'completed', due: D0 + 'T00:00:00.000Z' }), g('K', { due: D1 + 'T00:00:00.000Z' })]);
    assert.equal(row(del, 'T').status, 'Ⓓ');
    assert.ok(row(del, 'K'));
  });
});
