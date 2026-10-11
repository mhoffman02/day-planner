import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colLetter, quoteTab, a1Range, buildValueRanges, chunkValueRanges } from '../src/integration/sheetRanges.js';

test('colLetter maps 1-based indexes to A1 letters', () => {
  assert.equal(colLetter(1), 'A');
  assert.equal(colLetter(26), 'Z');
  assert.equal(colLetter(27), 'AA');
  assert.equal(colLetter(52), 'AZ');
  assert.equal(colLetter(703), 'AAA');
});

test('colLetter throws on invalid input', () => {
  for (const bad of [0, -1, 1.5, NaN, '3', null, undefined]) {
    assert.throws(() => colLetter(bad), /colLetter/);
  }
});

test('quoteTab wraps in single quotes and doubles embedded quotes', () => {
  assert.equal(quoteTab('Ledger'), "'Ledger'");
  assert.equal(quoteTab("O'Brien"), "'O''Brien'");
  assert.equal(quoteTab("a''b"), "'a''''b'");
});

test('quoteTab throws on empty or non-string', () => {
  assert.throws(() => quoteTab(''), /quoteTab/);
  assert.throws(() => quoteTab(undefined), /quoteTab/);
});

test('a1Range joins quoted tab and A1', () => {
  assert.equal(a1Range("O'Brien", 'A1'), "'O''Brien'!A1");
  assert.equal(a1Range('Ledger', 'A2:C9'), "'Ledger'!A2:C9");
  assert.throws(() => a1Range('Ledger', ''), /a1Range/);
});

test('buildValueRanges maps queued writes to ValueRange objects', () => {
  const vals = [['x', 1]];
  assert.deepEqual(buildValueRanges([{ tab: "O'B", a1: 'A1:B1', values: vals }]), [{ range: "'O''B'!A1:B1", values: vals }]);
  assert.deepEqual(buildValueRanges([]), []);
});

test('buildValueRanges rejects bad shapes', () => {
  assert.throws(() => buildValueRanges('x'), /buildValueRanges/);
  assert.throws(() => buildValueRanges([{ tab: 'T', a1: 'A1', values: ['a'] }]), /2D array/);
  assert.throws(() => buildValueRanges([{ tab: 'T', a1: 'A1', values: 'a' }]), /2D array/);
  assert.throws(() => buildValueRanges([{ tab: 'T', a1: 'A1' }]), /2D array/);
});

test('chunkValueRanges splits into batches of at most cap (default 50)', () => {
  const items = Array.from({ length: 120 }, (_, i) => ({ range: 'r' + i, values: [[i]] }));
  assert.deepEqual(chunkValueRanges(items).map((c) => c.length), [50, 50, 20]);
  assert.deepEqual(chunkValueRanges(items, 100).map((c) => c.length), [100, 20]);
  assert.deepEqual(chunkValueRanges([]), []);
  assert.throws(() => chunkValueRanges(items, 0), /chunkValueRanges/);
  assert.throws(() => chunkValueRanges('x'), /chunkValueRanges/);
});
