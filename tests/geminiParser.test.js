/**
 * @file geminiParser.test.js
 * @description Unit tests for the deterministic Gemini meeting-notes parser and MeetingNotesProvider base.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseGeminiNotes, MeetingNotesProvider } from '../src/integration/geminiParser.js';

const doc = (...paras) => ({ paragraphs: paras });

describe('parseGeminiNotes', () => {
  it('missing notes -> empty proposals, not an error', () => {
    assert.deepEqual(parseGeminiNotes(null), []);
    assert.deepEqual(parseGeminiNotes(undefined), []);
    assert.deepEqual(parseGeminiNotes({ paragraphs: [] }), []);
    assert.deepEqual(parseGeminiNotes(''), []);
  });
  it('rejects wrong types loudly', () => assert.throws(() => parseGeminiNotes(42), /docModel/));
  it('action with no owner -> owner null, dueHint null', () => {
    const r = parseGeminiNotes(doc({ text: 'Action items', heading: true }, { text: 'Update the runbook', list: true }));
    assert.equal(r.length, 1);
    assert.equal(r[0].owner, null);
    assert.equal(r[0].dueHint, null);
    assert.equal(r[0].text, 'Update the runbook');
    assert.equal(r[0].sourceHeading, 'Action items');
    assert.match(r[0].actionHash, /^[0-9a-f]{16}$/);
  });
  it('checkbox and bullet forms both parsed (plain-string doc)', () => {
    const text = ['Next steps', '[ ] Send the draft', '- Book the room', '[x] File the form', 'plain prose, not an item'].join('\n');
    const r = parseGeminiNotes(text);
    assert.deepEqual(r.map((x) => x.text), ['Send the draft', 'Book the room', 'File the form']);
  });
  it('detects owners: Owner:, @name, X will', () => {
    const r = parseGeminiNotes(doc(
      { text: 'Suggested next steps', heading: true },
      { text: 'Owner: Dana - draft the memo', list: true },
      { text: '@erin to schedule the review', list: true },
      { text: 'Frank Lee will update the tracker by Friday', list: true }
    ));
    assert.deepEqual(r.map((x) => x.owner), ['Dana', 'erin', 'Frank Lee']);
    assert.equal(r[2].dueHint, 'Friday');
  });
  it('ignores items outside action headings; stops at next heading', () => {
    const r = parseGeminiNotes(doc(
      { text: 'Summary', heading: true }, { text: 'Discussed budget', list: true },
      { text: 'Action items', heading: true }, { text: 'Do A', list: true },
      { text: 'Decisions', heading: true }, { text: 'Chose B', list: true }
    ));
    assert.deepEqual(r.map((x) => x.text), ['Do A']);
  });
  it('markdown headings work and offsets point into the joined text', () => {
    const text = '# Action items\n- Do A\n- Do B';
    const r = parseGeminiNotes(text);
    assert.equal(r.length, 2);
    assert.equal(text.slice(r[1].sourceOffset).startsWith('- Do B'), true);
  });
  it('actionHash stable across reruns and duplicates collapse', () => {
    const d = doc({ text: 'Action items', heading: true }, { text: 'Send the Draft.', list: true }, { text: 'send  the draft', list: true });
    const a = parseGeminiNotes(d);
    const b = parseGeminiNotes(JSON.parse(JSON.stringify(d)));
    assert.equal(a.length, 1);
    assert.equal(a[0].actionHash, b[0].actionHash);
  });
  it('different actions hash differently', () => {
    const r = parseGeminiNotes('Action items\n- Do A\n- Do B');
    assert.notEqual(r[0].actionHash, r[1].actionHash);
  });
  it('does not read Date.now', () => {
    const orig = Date.now;
    Date.now = () => { throw new Error('Date.now called'); };
    try { parseGeminiNotes('Action items\n- Do A'); } finally { Date.now = orig; }
  });
});

describe('MeetingNotesProvider', () => {
  it('base throws Not configured', () => {
    const p = new MeetingNotesProvider();
    assert.throws(() => p.discoverForOccurrence({}), /Not configured/);
    assert.throws(() => p.readProposedActions('id'), /Not configured/);
    assert.throws(() => p.readProposedDecisions('id'), /Not configured/);
  });
});
