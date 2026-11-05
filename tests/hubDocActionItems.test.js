/**
 * @file hubDocActionItems.test.js
 * @description Doc action items RPCs (HubController.gs): flag gate, assignee matching, ledger-backed dismiss,
 * Task from Drive metadata (never client values), per-file failure isolation, and the mock client parity.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext } from './helpers/gasFakesHub.js';
import { HubMock } from '../src/hubMock.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const FILE_A = 'FileAAAAAAAAAA1';
const FILE_B = 'FileBBBBBBBBBB2';

function setup(features = {}, repo = {}) {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true, DRY_RUN: false, DOC_ACTION_ITEMS: true, ...features } });
  const comments = {
    [FILE_A]: [{ id: 'c1', assigneeEmailAddress: 'me@example.test', content: 'Please update the budget table', author: { displayName: 'Ann' }, modifiedTime: '2026-11-04T10:00:00Z' }],
    [FILE_B]: [{ id: 'c2', assigneeEmailAddress: 'me@example.test', content: 'x', author: { displayName: 'Bo' }, modifiedTime: '2026-11-04T11:00:00Z' }]
  };
  ctx.DPDriveFollowupRepo = Object.freeze({
    listFollowupFiles: () => [{ id: FILE_A, name: 'Budget plan', modifiedTime: '2026-11-04T10:00:00Z' }, { id: FILE_B, name: 'Other doc', modifiedTime: '2026-11-04T11:00:00Z' }],
    listComments: (id) => { if (repo.failFor === id) throw new Error('drive 500'); return comments[id]; },
    getFile: (id) => ({ id, name: id === FILE_A ? 'Budget plan' : 'Other doc', mimeType: 'application/vnd.google-apps.document' }),
    canary: () => ({ actionItemsCount: 2, bogusCount: 0 })
  });
  return ctx;
}

test('getDocActionItems: flag off -> FLAG_OFF failure', () => {
  const r = call(setup({ DOC_ACTION_ITEMS: false }), 'getDocActionItems');
  assert.equal(r.ok, false);
  assert.equal(r.errorCode, 'FLAG_OFF');
});

test('getDocActionItems: returns assigned rows, one file failing does not hide the others', () => {
  const r = call(setup({}, { failFor: FILE_B }), 'getDocActionItems');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.rows.map((x) => x.itemId), [`${FILE_A}~c1`]);
  assert.equal(r.itemErrors.length, 1);
  assert.equal(r.rows[0].sourceType, 'DOC_COMMENT');
});

test('dismissDocItem: ledger DONE, row gone from the next load, comment text never in the ledger', () => {
  const ctx = setup();
  const id = `${FILE_A}~c1`;
  const d = call(ctx, 'dismissDocItem', id, {});
  assert.equal(d.status, 'DONE', JSON.stringify(d));
  assert.match(d.operationKey, /^DOC\|.*\|DISMISS$/);
  const r = call(ctx, 'getDocActionItems');
  assert.deepEqual(r.rows.map((x) => x.itemId), [`${FILE_B}~c2`]);
  assert.ok(!JSON.stringify([...ctx.__hub.ledger.rows.values()]).includes('budget table'));
  assert.equal(call(ctx, 'dismissDocItem', id, {}).status, 'SKIPPED');
});

test('dismissDocItem: bad id is refused, nothing written', () => {
  const ctx = setup();
  const r = call(ctx, 'dismissDocItem', 'not an id', {});
  assert.equal(r.ok, false);
  assert.equal(ctx.__hub.ledger.rows.size, 0);
});

test('routeDocItemToTask: Task title and link come from Drive, ledger key is DOC|..|TASK', () => {
  const ctx = setup();
  const r = call(ctx, 'routeDocItemToTask', `${FILE_A}~c1`, { priority: 'B1' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.status, 'DONE');
  assert.match(r.operationKey, /^DOC\|.*\|TASK$/);
  assert.equal(ctx.__hub.tasks.inserts, 1);
  const item = ctx.__hub.tasks.items[0];
  assert.match(JSON.stringify(item), /Budget plan/);
  assert.match(JSON.stringify(item), new RegExp(`${FILE_A}/edit\\?disco=c1`));
});

test('routeDocItemToTask: trial mode creates nothing', () => {
  const ctx = setup({ DRY_RUN: true });
  const r = call(ctx, 'routeDocItemToTask', `${FILE_A}~c1`, {});
  assert.equal(r.status, 'DRY_RUN', JSON.stringify(r));
  assert.equal(ctx.__hub.tasks.inserts, 0);
});

test('docActionCanary: returns the repo counts', () => {
  const r = call(setup(), 'docActionCanary');
  assert.equal(r.ok, true);
  assert.equal(r.data.bogusCount, 0);
});

test('HubMock: Doc rows, dismiss hides them, Task lands in the mock task list', () => {
  const m = new HubMock();
  const rows = m.getDocActionItems().rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceType, 'DOC_COMMENT');
  assert.equal(m.routeDocItemToTask(rows[0].itemId, { priority: 'B1' }).status, 'DONE');
  assert.equal(m.tasks.length >= 1, true);
  assert.equal(m.dismissDocItem(rows[0].itemId, {}).status, 'DONE');
  assert.equal(m.getDocActionItems().rows.length, 0);
});
