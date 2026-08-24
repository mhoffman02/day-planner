/**
 * @file indexParser.test.js
 * @description Unit tests for index tag parsing from daily notes and record aggregation.
 */

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
      Working on feature specs for Day Planner.
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

    const sortedAsc = aggregateIndexRecords(records, true);
    assert.equal(sortedAsc[0].date, '2026-08-10');
    assert.equal(sortedAsc[2].date, '2026-08-15');
  });

  it('should return an empty array for empty/missing note text', () => {
    assert.deepEqual(parseIndexEntriesFromNote(), []);
    assert.deepEqual(parseIndexEntriesFromNote(''), []);
  });

  it('should return an empty array when no index tags are present', () => {
    const entries = parseIndexEntriesFromNote('Just a regular note with no tags at all.', '2026-08-15');
    assert.deepEqual(entries, []);
  });

  it('should default to topic "General" when a tag has no colon or bracketed topic', () => {
    const entries = parseIndexEntriesFromNote('#index Plain summary with no topic marker', '2026-08-15');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].topic, 'General');
    assert.equal(entries[0].summary, 'Plain summary with no topic marker');
  });

  it('should fall back to today\'s local date and a generated doc anchor when not provided', () => {
    const entries = parseIndexEntriesFromNote('#index [Ops] Rotated on-call schedule');
    assert.equal(entries.length, 1);
    assert.match(entries[0].date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(entries[0].docUrl, `#doc-`);
  });
});
