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
  const stats = { listCalls: 0, commentCalls: [] };
  ctx.__docStats = stats;
  ctx.__docFiles = repo.files || [{ id: FILE_A, name: 'Budget plan', modifiedTime: '2026-11-04T10:00:00Z' }, { id: FILE_B, name: 'Other doc', modifiedTime: '2026-11-04T11:00:00Z' }];
  ctx.__docComments = comments;
  ctx.DPDriveFollowupRepo = Object.freeze({
    listFollowupFiles: () => { stats.listCalls++; return ctx.__docFiles; },
    listComments: (id) => { stats.commentCalls.push(id); if (repo.failFor === id) throw new Error('drive 500'); return comments[id] || []; },
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

// ---- cache, fan-out cap, negative memo, provenance ----
const cacheKeys = (ctx) => [...ctx.__hub.cache.store.keys()];

test('getDocActionItems: second call is a cache hit (no Drive calls), TTL 300s', () => {
  const ctx = setup();
  const a = call(ctx, 'getDocActionItems');
  const listAfterFirst = ctx.__docStats.listCalls;
  const b = call(ctx, 'getDocActionItems');
  assert.equal(ctx.__docStats.listCalls, listAfterFirst, 'cache hit must not call Drive');
  assert.deepEqual(b.rows.map((x) => x.itemId), a.rows.map((x) => x.itemId));
  const key = cacheKeys(ctx).find((k) => k.startsWith('docItems'));
  assert.ok(key, 'rows cached');
  assert.equal(ctx.__hub.cache.ttl.get(key), 300);
});

test('getDocActionItems: refresh=true bypasses the cache', () => {
  const ctx = setup();
  call(ctx, 'getDocActionItems');
  const n = ctx.__docStats.listCalls;
  const r = call(ctx, 'getDocActionItems', true);
  assert.equal(r.ok, true);
  assert.equal(ctx.__docStats.listCalls, n + 1);
});

test('getDocActionItems: non-boolean refresh is rejected by the guard', () => {
  const r = call(setup(), 'getDocActionItems', 'yes');
  assert.equal(r.ok, false);
});

test('getDocActionItems: a per-file failure is never cached', () => {
  const ctx = setup({}, { failFor: FILE_B });
  call(ctx, 'getDocActionItems');
  assert.equal(cacheKeys(ctx).some((k) => k.startsWith('docItems')), false);
  call(ctx, 'getDocActionItems');
  assert.equal(ctx.__docStats.listCalls, 2);
});

test('getDocActionItems: a thrown listing is not cached', () => {
  const ctx = setup();
  ctx.DPDriveFollowupRepo = Object.freeze({ ...ctx.DPDriveFollowupRepo, listFollowupFiles: () => { throw new Error('drive down'); } });
  const r = call(ctx, 'getDocActionItems');
  assert.equal(r.ok, false);
  assert.equal(cacheKeys(ctx).some((k) => k.startsWith('docItems')), false);
});

test('dismissDocItem and routeDocItemToTask clear the rows cache', () => {
  const ctx = setup();
  call(ctx, 'getDocActionItems');
  assert.ok(cacheKeys(ctx).some((k) => k.startsWith('docItems')));
  call(ctx, 'dismissDocItem', `${FILE_A}~c1`, {});
  assert.equal(cacheKeys(ctx).some((k) => k.startsWith('docItems')), false);
  call(ctx, 'getDocActionItems');
  assert.ok(cacheKeys(ctx).some((k) => k.startsWith('docItems')));
  call(ctx, 'routeDocItemToTask', `${FILE_B}~c2`, { priority: 'B1' });
  assert.equal(cacheKeys(ctx).some((k) => k.startsWith('docItems')), false);
});

test('getDocActionItems: payload over 90 KB is returned whole but not cached', () => {
  const big = 'x'.repeat(1900);
  const files = Array.from({ length: 50 }, (_, i) => ({ id: `BigFile${String(i).padStart(4, '0')}`, name: `Doc ${i}`, modifiedTime: `2026-11-04T10:${String(i).padStart(2, '0')}:00Z` }));
  const ctx = setup({}, { files });
  files.forEach((f) => { ctx.__docComments[f.id] = [{ id: 'c1', assigneeEmailAddress: 'me@example.test', content: big, author: { displayName: 'A' } }]; });
  const r = call(ctx, 'getDocActionItems');
  assert.equal(r.rows.length, 50);
  assert.equal(cacheKeys(ctx).some((k) => k.startsWith('docItems')), false);
});

test('getDocActionItems: at most 50 files by modifiedTime desc, truncated count returned', () => {
  const files = Array.from({ length: 60 }, (_, i) => ({ id: `File${String(i).padStart(6, '0')}`, name: `Doc ${i}`, modifiedTime: `2026-11-04T10:${String(i).padStart(2, '0')}:00Z` }));
  const ctx = setup({}, { files });
  const r = call(ctx, 'getDocActionItems');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(ctx.__docStats.commentCalls.length, 50);
  assert.equal(r.truncated, 10);
  assert.ok(ctx.__docStats.commentCalls.includes('File000059'), 'newest processed');
  assert.ok(!ctx.__docStats.commentCalls.includes('File000000'), 'oldest dropped');
  assert.match(r.message, /10/);
});

test('getDocActionItems: no truncation reports truncated 0', () => {
  assert.equal(call(setup(), 'getDocActionItems').truncated, 0);
});

test('negative memo: file with no assigned comment skips comments.list while modifiedTime is unchanged', () => {
  const files = [{ id: FILE_A, name: 'Budget plan', modifiedTime: '2026-11-04T10:00:00Z' }];
  const ctx = setup({}, { files });
  ctx.__docComments[FILE_A] = [{ id: 'c9', assigneeEmailAddress: 'other@example.test', content: 'not mine' }];
  const a = call(ctx, 'getDocActionItems');
  assert.equal(a.rows[0].unmatched, true);
  assert.equal(ctx.__docStats.commentCalls.length, 1);
  const memo = cacheKeys(ctx).find((k) => k.startsWith('docNeg'));
  assert.ok(memo, 'memo stored');
  assert.equal(ctx.__hub.cache.ttl.get(memo), 21600);
  ctx.__hub.cache.store.delete('docItems.v1');
  const b = call(ctx, 'getDocActionItems');
  assert.equal(ctx.__docStats.commentCalls.length, 1, 'memo hit skips comments.list');
  assert.equal(b.rows[0].unmatched, true);
  assert.equal(b.rows[0].itemId, `${FILE_A}~FILE`);
  call(ctx, 'getDocActionItems', true);
  assert.equal(ctx.__docStats.commentCalls.length, 2, 'refresh=true re-reads comments (escape hatch: a new assignment may not bump modifiedTime)');
});

test('negative memo: a modifiedTime change invalidates it', () => {
  const files = [{ id: FILE_A, name: 'Budget plan', modifiedTime: '2026-11-04T10:00:00Z' }];
  const ctx = setup({}, { files });
  ctx.__docComments[FILE_A] = [];
  call(ctx, 'getDocActionItems');
  ctx.__docFiles = [{ id: FILE_A, name: 'Budget plan', modifiedTime: '2026-11-04T12:00:00Z' }];
  ctx.__docComments[FILE_A] = [{ id: 'c1', assigneeEmailAddress: 'me@example.test', content: 'now mine' }];
  ctx.__hub.cache.store.delete('docItems.v1');
  const r = call(ctx, 'getDocActionItems');
  assert.equal(ctx.__docStats.commentCalls.length, 2);
  assert.equal(r.rows[0].itemId, `${FILE_A}~c1`);
});

test('negative memo: never written for a file with an assigned comment or one that errored', () => {
  const ctx = setup({}, { failFor: FILE_B });
  call(ctx, 'getDocActionItems');
  assert.equal(cacheKeys(ctx).some((k) => k.startsWith('docNeg')), false);
});

test('routeDocItemToTask: notes carry a static provenance line then the disco link, no claim the comment is open now', () => {
  const ctx = setup();
  call(ctx, 'routeDocItemToTask', `${FILE_A}~c1`, { priority: 'B1' });
  const notes = ctx.__hub.tasks.items[0].notes;
  const lines = notes.split('\n');
  assert.match(lines[0], /^Doc action item: Budget plan, routed from an open comment on \d{4}-\d{2}-\d{2}$/);
  assert.match(lines[1], new RegExp(`${FILE_A}/edit\\?disco=c1`));
  assert.ok(!/currently|still open|unresolved/i.test(notes));
  assert.ok(!notes.startsWith('Gmail:'));
});
