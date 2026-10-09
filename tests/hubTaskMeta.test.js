/**
 * @file hubTaskMeta.test.js
 * @description (j) opKey survives encodeTaskMeta/decodeTaskMeta after a star edit. Runs the REAL
 * source sliced out of gas-app/Code.gs (functions are IIFE-private, so no import path exists).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const codeGs = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'gas-app', 'Code.gs'), 'utf8');

function loadMetaFns() {
  const start = codeGs.indexOf('const TASK_META_MARKER_RE');
  const encAt = codeGs.indexOf('function encodeTaskMeta(');
  const end = codeGs.indexOf('\n}\n', encAt) + 3;
  assert.ok(start > 0 && encAt > start && end > encAt, 'could not slice meta functions from Code.gs');
  const ctx = vm.createContext({});
  vm.runInContext(`${codeGs.slice(start, end)}\nthis.enc = encodeTaskMeta; this.dec = decodeTaskMeta;`, ctx);
  return ctx;
}

const HUB_NOTES = [
  'Gmail: https://mail.google.com/mail/u/0/#all/t1',
  'Created: 2026-10-06T10:00:00.000Z',
  '',
  '[Waiting]',
  '<!--dp-meta:{"opKey":"GMAIL|t1|WAITING","gmailThreadId":"t1","waitingOn":"Pat","nagDate":"2026-10-10"}-->'
].join('\n');

test('(j) starring a hub Task keeps opKey and the [Waiting] tag; unstar removes only the star', () => {
  const { enc, dec } = loadMetaFns();
  const starred = enc(HUB_NOTES, { starred: true });
  const meta = JSON.parse(JSON.stringify(dec(starred)));
  assert.equal(meta.opKey, 'GMAIL|t1|WAITING');
  assert.equal(meta.waitingOn, 'Pat');
  assert.equal(meta.nagDate, '2026-10-10');
  assert.equal(meta.starred, true);
  assert.match(starred, /\[Waiting\]/);

  const unstarred = enc(starred, { starred: false });
  const meta2 = JSON.parse(JSON.stringify(dec(unstarred)));
  assert.equal(meta2.opKey, 'GMAIL|t1|WAITING');
  assert.ok(!meta2.starred);
  assert.ok(!/\[Starred\]/.test(unstarred));
});

test('(j) category edit then star edit still keeps opKey (repeated round trips)', () => {
  const { enc, dec } = loadMetaFns();
  let notes = enc(HUB_NOTES, { category: 'Work' });
  notes = enc(notes, { starred: true });
  notes = enc(notes, { category: 'General' });
  const meta = JSON.parse(JSON.stringify(dec(notes)));
  assert.equal(meta.opKey, 'GMAIL|t1|WAITING');
  assert.equal(meta.starred, true);
  assert.equal(meta.category, undefined);
});

test('legacy notes without hub keys encode exactly as before (no marker emitted)', () => {
  const { enc } = loadMetaFns();
  assert.equal(enc('plain note', { starred: true }), 'plain note\n\n[Starred]');
  assert.equal(enc('plain note\n\n[Starred]', { starred: false }), 'plain note');
});
