import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIndexEntriesFromNote,
  aggregateIndexRecords
} from '../src/indexParser.js';

describe('Index Parser Unit Tests', () => {
  it('should parse #index and [INDEX] tags from daily note text', () => {
    const noteText = `
      Reviewed morning emails and client updates.
      #index [Finance] Approved Q3 marketing budget of $12,000
      Working on feature specs for Franklin Planner.
      [INDEX] [Architecture] Decided on Alpine.js and GAS Web App structure.
      Regular meeting notes follow here.
    `;

    const entries = parseIndexEntriesFromNote(noteText, '2026-08-15', 'https://docs.google.com/doc1');

    assert.equal(entries.length, 2);
    assert.equal(entries[0].topic, 'Finance');
    assert.equal(entries[0].summary, 'Approved Q3 marketing budget of $12,000');
    assert.equal(entries[0].docUrl, 'https://docs.google.com/doc1');
    assert.equal(entries[0].date, '2026-08-15');

    assert.equal(entries[1].topic, 'Architecture');
    assert.equal(entries[1].summary, 'Decided on Alpine.js and GAS Web App structure.');
  });

  it('should aggregate and sort index records by date', () => {
    const records = [
      { date: '2026-08-10', summary: 'Older decision' },
      { date: '2026-08-15', summary: 'Newer decision' },
      { date: '2026-08-12', summary: 'Mid decision' }
    ];

    const sortedDesc = aggregateIndexRecords(records, false);
    assert.equal(sortedDesc[0].date, '2026-08-15');
    assert.equal(sortedDesc[1].date, '2026-08-12');
    assert.equal(sortedDesc[2].date, '2026-08-10');
  });
});
