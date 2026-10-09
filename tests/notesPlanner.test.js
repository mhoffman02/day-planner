import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gmailMeetingKey } from '../src/integration/contracts.js';
import {
  NOTES_SECTIONS, planOccurrenceSection, planCarryIn, carryInCount, applyNotesRequests,
  notesPlannerHeadingText
} from '../src/integration/notesPlanner.js';
import { runOperation } from '../src/integration/ledger.js';

const occ = { occurrenceId: 'EV1', date: '2026-10-06', displayName: 'NCMMS Core Team' };
const carry = {
  threadId: 'thr1', kind: 'Decision/Input needed', framing: 'Need go/no-go on vendor', subject: 'Vendor renewal',
  fromName: 'Pat Lee', receivedDate: '2026-10-05', gmailUrl: 'https://mail.google.com/mail/u/0/#inbox/thr1'
};
const P = (text, style = 'NORMAL', extra = {}) => ({ text, style, ...extra });

function skeletonDoc(skip = []) {
  const ps = [P('Core notes', 'TITLE'), P(notesPlannerHeadingText(occ), 'HEADING_2')];
  for (const s of NOTES_SECTIONS) {
    if (skip.includes(s)) continue;
    ps.push(P(s, 'HEADING_3'), P(''));
  }
  return { paragraphs: ps };
}

test('heading text and the six canonical sections', () => {
  assert.equal(notesPlannerHeadingText(occ), '2026-10-06 — NCMMS Core Team');
  assert.deepEqual([...NOTES_SECTIONS], ['PREP / EMAIL CARRY-INS', 'AGENDA', 'HUMAN NOTES', 'DECISIONS', 'ACTION ITEMS', 'GEMINI RECONCILIATION']);
});

test('(e) heading missing -> full skeleton created, once', () => {
  const doc = { paragraphs: [P('Core notes', 'TITLE')] };
  const plan = planOccurrenceSection(doc, occ);
  assert.equal(plan.status, 'CREATE_SKELETON');
  assert.deepEqual(plan.missing, [...NOTES_SECTIONS]);
  const after = applyNotesRequests(doc, plan.requests);
  const again = planOccurrenceSection(after, occ);
  assert.equal(again.status, 'EXISTS');
  assert.deepEqual(again.requests, []);
  const texts = after.paragraphs.map((p) => p.text);
  assert.equal(texts.filter((t) => t === notesPlannerHeadingText(occ)).length, 1);
  for (const s of NOTES_SECTIONS) assert.ok(texts.includes(s));
});

test('(e) subsection missing -> only that subsection added, in canonical order', () => {
  const doc = skeletonDoc(['DECISIONS']);
  const plan = planOccurrenceSection(doc, occ);
  assert.equal(plan.status, 'ADD_SUBSECTIONS');
  assert.deepEqual(plan.missing, ['DECISIONS']);
  assert.equal(plan.requests.length, 1);
  const after = applyNotesRequests(doc, plan.requests);
  const heads = after.paragraphs.filter((p) => p.style === 'HEADING_3').map((p) => p.text);
  assert.deepEqual(heads, [...NOTES_SECTIONS]);
  assert.equal(after.paragraphs.length, doc.paragraphs.length + 2);
});

test('occurrence block stops at the next date heading (other occurrences untouched)', () => {
  const other = [P('2026-09-29 — NCMMS Core Team', 'HEADING_2'), P('PREP / EMAIL CARRY-INS', 'HEADING_3'), P('')];
  const doc = { paragraphs: [...other, ...skeletonDoc(['AGENDA']).paragraphs] };
  const plan = planOccurrenceSection(doc, occ);
  assert.deepEqual(plan.missing, ['AGENDA']);
});

test('(e/#8) doc inaccessible -> retryable ERROR via ledger, no partial write', () => {
  assert.throws(() => planOccurrenceSection(null, occ), (e) => e.code === 'DOC_INACCESSIBLE' && e.retryable === true);
  assert.throws(() => planCarryIn({ accessible: false }, occ, carry), (e) => e.code === 'DOC_INACCESSIBLE');
  const writes = [];
  const rows = new Map();
  const r = runOperation({
    store: { get: (k) => rows.get(k) || null, put: (x) => rows.set(x.OperationKey, x) },
    lock: { tryLock: () => true, releaseLock: () => {} },
    clock: () => new Date('2026-10-05T10:00:00Z'),
    op: { opKey: gmailMeetingKey('thr1', 'EV1'), sourceType: 'GMAIL', sourceId: 'thr1', action: 'APPEND_CARRY_IN' },
    work: () => { const plan = planCarryIn(null, occ, carry); writes.push(plan); return {}; }
  });
  assert.equal(r.ok, false);
  assert.equal(r.retryable, true);
  assert.equal(r.errorCode, 'DOC_INACCESSIBLE');
  assert.equal(writes.length, 0);
  assert.equal(rows.get(gmailMeetingKey('thr1', 'EV1')).Status, 'ERROR');
});

test('carry-in uses spec section 8 format with a Gmail link', () => {
  const plan = planCarryIn(skeletonDoc(), occ, carry);
  assert.equal(plan.action, 'APPEND');
  const after = applyNotesRequests(skeletonDoc(), plan.requests);
  const idx = after.paragraphs.findIndex((p) => p.text.startsWith('•'));
  assert.equal(after.paragraphs[idx].text, '• [Decision/Input needed] Need go/no-go on vendor — Vendor renewal');
  const l2 = after.paragraphs[idx + 1];
  assert.equal(l2.text, '  From: Pat Lee | Received: 2026-10-05 | Gmail');
  assert.equal(l2.links.length, 1);
  assert.equal(l2.text.slice(l2.links[0].start, l2.links[0].end), 'Gmail');
  assert.ok(l2.links[0].url.startsWith(carry.gmailUrl));
  // lands inside PREP, before AGENDA
  const agenda = after.paragraphs.findIndex((p) => p.text === 'AGENDA');
  assert.ok(idx < agenda);
  assert.ok(idx > after.paragraphs.findIndex((p) => p.text === 'PREP / EMAIL CARRY-INS'));
});

test('carry-in without framing drops the framing segment; optional excerpt is capped', () => {
  const doc = skeletonDoc();
  const plan = planCarryIn(doc, occ, { ...carry, framing: '', excerpt: 'x'.repeat(500) }, { maxExcerpt: 50 });
  const after = applyNotesRequests(doc, plan.requests);
  assert.equal(after.paragraphs.find((p) => p.text.startsWith('•')).text, '• [Decision/Input needed] Vendor renewal');
  const ex = after.paragraphs.find((p) => p.text.startsWith('  “'));
  assert.ok(ex.text.length <= 50 + 6);
  assert.ok(ex.text.includes('…'));
});

test('pointer only: body-like fields are rejected', () => {
  assert.throws(() => planCarryIn(skeletonDoc(), occ, { ...carry, body: 'full email' }), /pointer/);
});

test('appended exactly once across 3 reruns; missing heading handled in the same plan', () => {
  let doc = { paragraphs: [P('Core notes', 'TITLE')] };
  const outcomes = [];
  for (let i = 0; i < 3; i += 1) {
    const plan = planCarryIn(doc, occ, carry);
    outcomes.push(plan.action);
    doc = applyNotesRequests(doc, plan.requests);
  }
  assert.deepEqual(outcomes, ['APPEND', 'ALREADY_PRESENT', 'ALREADY_PRESENT']);
  assert.equal(carryInCount(doc, occ), 1);
  assert.equal(doc.paragraphs.filter((p) => p.text === notesPlannerHeadingText(occ)).length, 1);
  // a different thread appends separately
  const second = planCarryIn(doc, occ, { ...carry, threadId: 'thr2', subject: 'Other', gmailUrl: 'https://mail.google.com/mail/u/0/#inbox/thr2' });
  assert.equal(second.action, 'APPEND');
  assert.notEqual(second.signature, planCarryIn(doc, occ, carry).signature);
  assert.equal(carryInCount(applyNotesRequests(doc, second.requests), occ), 2);
});

test('dedupe survives a user editing the visible text (signature rides in the link)', () => {
  let doc = skeletonDoc();
  doc = applyNotesRequests(doc, planCarryIn(doc, occ, carry).requests);
  doc.paragraphs = doc.paragraphs.map((p) => (p.text.startsWith('•') ? { ...p, text: '• edited by hand' } : p));
  assert.equal(planCarryIn(doc, occ, carry).action, 'ALREADY_PRESENT');
});

test('carryInCount is 0 when heading missing and ignores other occurrences', () => {
  assert.equal(carryInCount({ paragraphs: [] }, occ), 0);
  assert.equal(carryInCount(null, occ), 0);
  let doc = skeletonDoc();
  doc = applyNotesRequests(doc, planCarryIn(doc, occ, carry).requests);
  assert.equal(carryInCount(doc, { ...occ, date: '2026-10-13' }), 0);
});
