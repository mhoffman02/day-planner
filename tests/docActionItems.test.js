/**
 * @file docActionItems.test.js
 * @description Doc action items in Triage: pure row selection from Drive v3 comments, and the ledger key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectAssignedComments, DOC_ACTION_SNIPPET_CAP, DOC_ACTION_PREVIEW_CAP,
  DOC_ACTION_FILE_CAP, DOC_ACTION_TIME_BUDGET_MS, DOC_ACTION_CACHE_TTL_S, DOC_ACTION_MEMO_TTL_S, DOC_ACTION_CACHE_MAX_BYTES,
  docActionProvenance, docActionMemoKey
} from '../src/integration/docActionItems.js';
import { docActionKey } from '../src/integration/contracts.js';
import { planTaskFromThread } from '../src/integration/taskPlanner.js';

const FILE = { id: 'F1', name: 'Plan', mimeType: 'application/vnd.google-apps.document' };
const ME = 'me@example.com';

function fixtureComments() {
  return [
    { id: 'C1', resolved: false, assigneeEmailAddress: 'Me@Example.com', content: 'Please finalize', quotedFileContent: { value: 'Budget table' }, author: { displayName: 'Ann' }, modifiedTime: '2026-11-04T10:00:00.000Z' },
    { id: 'C2', resolved: false, mentionedEmailAddresses: [ME], content: '@me FYI', author: { displayName: 'Bob' }, modifiedTime: '2026-11-04T11:00:00.000Z' },
    { id: 'C3', resolved: true, assigneeEmailAddress: ME, content: 'Done already', author: { displayName: 'Cy' }, modifiedTime: '2026-11-03T11:00:00.000Z' }
  ];
}

test('assigned, mention-only and resolved comments yield exactly one row for the open assignment', () => {
  const rows = selectAssignedComments({ file: FILE, comments: fixtureComments(), userEmail: ME });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, 'https://docs.google.com/document/d/F1/edit?disco=C1');
  assert.equal(rows[0].sourceTag, 'Doc action item');
  assert.equal(rows[0].itemId, 'F1~C1');
  assert.equal(rows[0].subject, 'Plan');
  assert.equal(rows[0].fromName, 'Ann');
  assert.equal(rows[0].unmatched, false);
  assert.equal(rows[0].snippet, 'Budget table Please finalize');
});

test('a file with no matching comment yields one unmatched file-level row, never an empty list', () => {
  const rows = selectAssignedComments({ file: FILE, comments: fixtureComments().slice(1), userEmail: ME });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].unmatched, true);
  assert.equal(rows[0].itemId, 'F1~FILE');
  assert.equal(rows[0].url, 'https://docs.google.com/document/d/F1/edit');
  assert.equal(rows[0].sourceTag, 'Doc action item');
});

test('docActionKey builds the ledger key and rejects a pipe in an id', () => {
  assert.equal(docActionKey('F1', 'C1', 'TASK'), 'DOC|F1~C1|TASK');
  assert.equal(docActionKey('F1', 'C1', 'DISMISS'), 'DOC|F1~C1|DISMISS');
  assert.throws(() => docActionKey('F|1', 'C1', 'TASK'), /Invalid operation-key part/);
  assert.throws(() => docActionKey('F1', 'C|1', 'TASK'), /Invalid operation-key part/);
  assert.throws(() => docActionKey('F1', 'C1', 'BOGUS'), /action/);
});

test('snippet is capped at 160 chars and the full text at 2000', () => {
  const long = 'x'.repeat(3000);
  const rows = selectAssignedComments({ file: FILE, comments: [{ id: 'C9', resolved: false, assigneeEmailAddress: ME, content: long, author: { displayName: 'A' } }], userEmail: ME });
  assert.equal(DOC_ACTION_SNIPPET_CAP, 160);
  assert.equal(DOC_ACTION_PREVIEW_CAP, 2000);
  assert.equal(rows[0].snippet.length, 160);
  assert.equal(rows[0].preview.length, 2000);
});

test('sheets and slides use their own url path', () => {
  const sheet = selectAssignedComments({ file: { id: 'S1', name: 'T', mimeType: 'application/vnd.google-apps.spreadsheet' }, comments: [{ id: 'C1', assigneeEmailAddress: ME, content: 'a', author: { displayName: 'A' } }], userEmail: ME });
  assert.equal(sheet[0].url, 'https://docs.google.com/spreadsheets/d/S1/edit?disco=C1');
  const slide = selectAssignedComments({ file: { id: 'P1', name: 'T', mimeType: 'application/vnd.google-apps.presentation' }, comments: [], userEmail: ME });
  assert.equal(slide[0].url, 'https://docs.google.com/presentation/d/P1/edit');
});

test('a deleted comment is skipped and a missing userEmail fails loud', () => {
  const rows = selectAssignedComments({ file: FILE, comments: [{ id: 'C1', deleted: true, assigneeEmailAddress: ME, content: 'x', author: { displayName: 'A' } }], userEmail: ME });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].unmatched, true);
  assert.throws(() => selectAssignedComments({ file: FILE, comments: [], userEmail: '' }), /userEmail/);
});

test('cache and fan-out constants', () => {
  assert.equal(DOC_ACTION_FILE_CAP, 200);
  assert.equal(DOC_ACTION_TIME_BUDGET_MS, 240000);
  assert.equal(DOC_ACTION_CACHE_TTL_S, 1800);
  assert.equal(DOC_ACTION_MEMO_TTL_S, 21600);
  assert.equal(DOC_ACTION_CACHE_MAX_BYTES, 90 * 1024);
});

test('docActionMemoKey changes with modifiedTime and is stable otherwise', () => {
  assert.equal(docActionMemoKey('F1', 'T1'), docActionMemoKey('F1', 'T1'));
  assert.notEqual(docActionMemoKey('F1', 'T1'), docActionMemoKey('F1', 'T2'));
  assert.notEqual(docActionMemoKey('F1', 'T1'), docActionMemoKey('F2', 'T1'));
  assert.throws(() => docActionMemoKey('F1', ''), /modifiedTime/);
});

test('docActionProvenance is a static line with title and date', () => {
  assert.equal(docActionProvenance('Plan', '2026-11-05'), 'Doc action item: Plan, routed from an open comment on 2026-11-05');
  assert.equal(docActionProvenance('', '2026-11-05'), 'Doc action item: (untitled), routed from an open comment on 2026-11-05');
});

test('planTaskFromThread puts thread.provenance first, then the link, replacing the Gmail label', () => {
  const thread = { threadId: 'F1~C1', subject: 'Plan', url: 'https://docs.google.com/document/d/F1/edit?disco=C1', provenance: 'Doc action item: Plan, routed from an open comment on 2026-11-05' };
  const plan = planTaskFromThread({ thread, opKey: 'DOC|F1~C1|TASK', existingTasks: [], now: new Date(2026, 10, 5, 12), timeZone: 'America/New_York' });
  const lines = plan.task.notes.split('\n');
  assert.equal(lines[0], thread.provenance);
  assert.equal(lines[1], thread.url);
  assert.ok(!plan.task.notes.includes('Gmail:'));
});
