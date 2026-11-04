/**
 * @file triagePreview.test.js
 * @description Triage THREAD show-more needs more text than Gmail's ~200 char snippet. The board already reads full
 * bodies to score, so each row also carries `preview`: the latest message body without quoted replies, whitespace
 * collapsed, cut at 400 characters. Body text itself is still never returned. PreviewLines (Hub Config, 3-5,
 * default 3) sets how many lines the expanded preview shows; a bad value fails loud.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread } from './helpers/gasFakesHub.js';
import { triagePreview, TRIAGE_PREVIEW_MAX, TRIAGE_PREVIEW_LINES_DEFAULT, triagePreviewLines } from '../src/integration/triagePreview.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const items = (board) => Object.values(board.queues).flat();
const FEATURES = { GMAIL_ROUTER: true, TRIAGE_BOARD: true, DRY_RUN: true };

test('triagePreview collapses whitespace and drops quoted lines', () => {
  assert.equal(triagePreview('Hi Pat,\r\n\r\nCan you   sign\nby Friday?\n> old text\n> more old'), 'Hi Pat, Can you sign by Friday?');
});

test('triagePreview stops at the "On ... wrote:" reply header, including one wrapped over two lines', () => {
  assert.equal(triagePreview('Yes, approved.\n\nOn Mon, Nov 2, 2026 at 9:00 AM Pat <pat@example.test> wrote:\n> please approve'), 'Yes, approved.');
  assert.equal(triagePreview('Approved.\nOn Mon, Nov 2, 2026 at 9:00 AM Pat Q. Longname\n<pat@example.test> wrote:\nold'), 'Approved.');
});

test('triagePreview stops at an Original Message divider', () => {
  assert.equal(triagePreview('See below.\n-----Original Message-----\nFrom: Pat\nold body'), 'See below.');
});

test('triagePreview cuts at the max with an ellipsis and returns "" for an empty body', () => {
  const out = triagePreview('word '.repeat(300));
  assert.equal(out.length, TRIAGE_PREVIEW_MAX);
  assert.ok(out.endsWith('…'));
  assert.equal(triagePreview(''), '');
  assert.equal(triagePreview('> only quoted'), '');
});

test('triagePreview rejects a non-string body loudly', () => {
  assert.throws(() => triagePreview(42), /body must be a string/);
});

test('triagePreviewLines defaults to 3, accepts 3-5, and throws on anything else', () => {
  assert.equal(TRIAGE_PREVIEW_LINES_DEFAULT, 3);
  assert.equal(triagePreviewLines(undefined), 3);
  assert.equal(triagePreviewLines(''), 3);
  assert.equal(triagePreviewLines('4'), 4);
  assert.equal(triagePreviewLines(5), 5);
  for (const bad of ['2', '6', 'abc', '3.5', 0, -1]) {
    assert.throws(() => triagePreviewLines(bad), /PreviewLines must be a whole number from 3 to 5/, String(bad));
  }
});

test('board item carries a preview of the LATEST message body, never the body itself', () => {
  const ctx = makeHubContext({ features: FEATURES });
  addThread(ctx, { id: 't1', labels: ['00_AR'], subject: 'Approval', messages: [
    { from: 'Pat <pat@example.test>', body: 'first body', snippet: 'first' },
    { from: 'Lee <lee@example.test>', body: 'Please sign and send by Friday.\n\nOn Mon, Pat wrote:\n> first body', snippet: 'Please sign' }
  ] });
  const item = items(call(ctx, 'getTriageBoard', {}))[0];
  assert.equal(item.preview, 'Please sign and send by Friday.');
  assert.ok(!('bodyText' in item));
});

test('countOnly board reads return an empty preview', () => {
  const ctx = makeHubContext({ features: FEATURES });
  addThread(ctx, { id: 't1', labels: ['00_AR'], subject: 'Approval', body: 'some body text' });
  assert.equal(items(call(ctx, 'getTriageBoard', { countOnly: true }))[0].preview, '');
});

test('getHubStatus reports previewLines (default 3)', () => {
  const ctx = makeHubContext({ features: FEATURES });
  assert.equal(call(ctx, 'getHubStatus').previewLines, 3);
});
