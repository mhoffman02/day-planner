import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCarryInsList } from '../src/integration/notesPlanner.js';

const full = {
  subject: 'Budget question', fromName: 'Pat', receivedDate: '2026-11-02', gmailUrl: 'https://mail.google.com/mail/#all/t1',
  snippet: 'Can we move the review?', kind: 'Decision', framing: 'Please decide'
};

test('empty list gives an empty string', () => {
  assert.equal(formatCarryInsList([], 'NCMMS Core'), '');
  assert.equal(formatCarryInsList(undefined, 'NCMMS Core'), '');
});

test('one item is a stand-alone bullet: subject, framing, quoted snippet, provenance tag, link last', () => {
  assert.equal(formatCarryInsList([full], 'NCMMS Core'),
    '• Budget question: Please decide. "Can we move the review?" [Email, Pat, 2026-11-02, Decision] https://mail.google.com/mail/#all/t1');
});

test('duplicate subjects each keep their own bullet', () => {
  const out = formatCarryInsList([full, { ...full, fromName: 'Sam', gmailUrl: 'https://mail.google.com/mail/#all/t2' }], 'x').split('\n');
  assert.equal(out.length, 2);
  assert.ok(out[0].includes('Pat') && out[0].endsWith('t1'));
  assert.ok(out[1].includes('Sam') && out[1].endsWith('t2'));
});

test('missing fromName, snippet, framing and kind are omitted cleanly', () => {
  const out = formatCarryInsList([{ subject: 'Bare', gmailUrl: 'https://mail.google.com/x', receivedDate: '2026-11-02' }], 'x');
  assert.equal(out, '• Bare [Email, 2026-11-02] https://mail.google.com/x');
  assert.doesNotMatch(out, /undefined|null|,,|\[Email, \]/);
});

test('a newline in any field never splits the bullet; snippet is shortened to about 140 chars', () => {
  const out = formatCarryInsList([{ ...full, subject: 'Two\nlines', snippet: `line one\nline two ${'y'.repeat(300)}` }], 'x');
  assert.equal(out.split('\n').length, 1);
  assert.match(out, /^• Two lines: Please decide\. "line one line two y+…"/);
  const quoted = out.match(/"([^"]*)"/)[1];
  assert.ok(quoted.length <= 140, String(quoted.length));
});

test('max size: 200 items give 200 single-line bullets, each ending with its link', () => {
  const items = Array.from({ length: 200 }, (_, i) => ({ ...full, subject: `S${i}`, gmailUrl: `https://mail.google.com/mail/#all/t${i}` }));
  const lines = formatCarryInsList(items, 'x').split('\n');
  assert.equal(lines.length, 200);
  lines.forEach((l, i) => assert.ok(l.startsWith('• S' + i + ':') && l.endsWith('/t' + i), l));
});
