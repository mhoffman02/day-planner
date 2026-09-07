/**
 * @file indexParser.test.js
 * @description Unit tests for index tag parsing from daily notes and record aggregation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIndexEntriesFromNote,
  aggregateIndexRecords,
  parseTaskLinksFromNote,
  decomposeIndexHeading,
  isDateHeading,
  parseDailyNoteToSections,
  serializeSectionsToDailyNote
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

describe('Task-Link Parser Unit Tests', () => {
  it('should parse a #task [A1] link line into a priority + summary', () => {
    const noteText = `
      ### #task [A1] Vendor follow-up
      Called vendor re: contract renewal, waiting on redline.
      Regular note line with no link.
    `;
    const links = parseTaskLinksFromNote(noteText);
    assert.equal(links.length, 1);
    assert.equal(links[0].priority, 'A1');
    assert.equal(links[0].summary, 'Vendor follow-up');
  });

  it('should match [TASK] tag as an alternative to #task', () => {
    const links = parseTaskLinksFromNote('[TASK] [B3] Reschedule dentist');
    assert.equal(links.length, 1);
    assert.equal(links[0].priority, 'B3');
    assert.equal(links[0].summary, 'Reschedule dentist');
  });

  it('should uppercase a lowercase priority code', () => {
    const links = parseTaskLinksFromNote('#task [a1] lowercase input');
    assert.equal(links[0].priority, 'A1');
  });

  it('should return multiple links from the same note', () => {
    const noteText = '#task [A1] first\n#task [B2] second';
    const links = parseTaskLinksFromNote(noteText);
    assert.equal(links.length, 2);
    assert.equal(links[0].priority, 'A1');
    assert.equal(links[1].priority, 'B2');
  });

  it('should ignore a #task tag with no bracketed priority', () => {
    const links = parseTaskLinksFromNote('#task no brackets here');
    assert.deepEqual(links, []);
  });

  it('should return an empty array for empty/missing note text', () => {
    assert.deepEqual(parseTaskLinksFromNote(), []);
    assert.deepEqual(parseTaskLinksFromNote(''), []);
  });
});

describe('Continuous Doc Accordion Parser Unit Tests', () => {
  it('should decompose index headings correctly', () => {
    assert.deepEqual(decomposeIndexHeading('#index [Architecture] System Design'), {
      indexTopic: 'Architecture',
      heading: 'System Design'
    });
    assert.deepEqual(decomposeIndexHeading('[INDEX] Finance: Budget Planning'), {
      indexTopic: 'Finance',
      heading: 'Budget Planning'
    });
    assert.deepEqual(decomposeIndexHeading('Plain Topic Heading'), {
      indexTopic: '',
      heading: 'Plain Topic Heading'
    });
  });

  it('should detect document date headings', () => {
    assert.equal(isDateHeading('Aug 15, 2026'), true);
    assert.equal(isDateHeading('August 15, 2026'), true);
    assert.equal(isDateHeading('2026-08-15'), true);
    assert.equal(isDateHeading('Daily Log - Aug 15, 2026'), true);
    assert.equal(isDateHeading('Architecture Review'), false);
  });

  it('should parse markdown note into date heading and collapsible sections', () => {
    const markdown = `# Aug 15, 2026

### #index [Architecture] System Design
Finalized 3-column binder layout with Alpine.js.
All components responsive.

### #index [Finance] Budget Sync
- Reviewed Q3 budget.
- Approved GCP allocation.`;

    const { dateHeading, sections } = parseDailyNoteToSections(markdown);
    assert.equal(dateHeading, 'Aug 15, 2026');
    assert.equal(sections.length, 2);

    assert.equal(sections[0].indexTopic, 'Architecture');
    assert.equal(sections[0].heading, 'System Design');
    assert.equal(sections[0].category, 'Work');
    assert.equal(sections[0].collapsed, false);
    assert.ok(sections[0].content.includes('Finalized 3-column binder layout'));

    assert.equal(sections[1].indexTopic, 'Finance');
    assert.equal(sections[1].heading, 'Budget Sync');
    assert.equal(sections[1].category, 'Decision');
    assert.equal(sections[1].collapsed, false);
    assert.ok(sections[1].content.includes('- Reviewed Q3 budget.'));
  });

  it('should reconcile with previous sections preserving stable IDs, categories, and collapsed states', () => {
    const prevSections = [
      {
        id: 'nc_stable_1',
        indexTopic: 'Architecture',
        heading: 'System Design',
        category: 'Work',
        collapsed: true,
        _activeLineIndex: 1
      },
      {
        id: 'nc_stable_2',
        indexTopic: 'Finance',
        heading: 'Budget Sync',
        category: 'Personal', // user customized category
        collapsed: false
      }
    ];

    const markdown = `# Aug 15, 2026

### #index [Architecture] System Design
Finalized 3-column binder layout with Alpine.js.
Updated line 2 with fresh edit.

### #index [Finance] Budget Sync
- Reviewed Q3 budget.

### #index [Team] Standup
Notes for standup.`;

    const { dateHeading, sections } = parseDailyNoteToSections(markdown, prevSections);
    assert.equal(dateHeading, 'Aug 15, 2026');
    assert.equal(sections.length, 3);

    // First section reused stable ID, preserved collapsed=true, and transient _activeLineIndex
    assert.equal(sections[0].id, 'nc_stable_1');
    assert.equal(sections[0].collapsed, true);
    assert.equal(sections[0]._activeLineIndex, 1);

    // Second section preserved user's custom category
    assert.equal(sections[1].id, 'nc_stable_2');
    assert.equal(sections[1].category, 'Personal');

    // Third section is newly created with a fresh ID and default collapsed=false
    assert.ok(sections[2].id.startsWith('nc_'));
    assert.notEqual(sections[2].id, 'nc_stable_1');
    assert.notEqual(sections[2].id, 'nc_stable_2');
    assert.equal(sections[2].collapsed, false);
    assert.equal(sections[2].category, 'Work');
  });

  it('should serialize sections to clean markdown, preserving date heading and #index tags', () => {
    const sections = [
      {
        id: 'nc_1',
        indexTopic: 'Architecture',
        heading: 'System Design',
        content: 'Finalized 3-column binder layout.\nSecond line.'
      },
      {
        id: 'nc_2',
        indexTopic: '',
        heading: 'General Notes',
        content: '- Review items\n- Next steps'
      }
    ];

    const markdown = serializeSectionsToDailyNote(sections, 'Aug 15, 2026');
    assert.ok(markdown.startsWith('# Aug 15, 2026\n\n'));
    assert.ok(markdown.includes('### #index [Architecture] System Design\nFinalized 3-column binder layout.\nSecond line.'));
    assert.ok(markdown.includes('### General Notes\n- Review items\n- Next steps'));

    // Round trip test: parsing the serialized markdown reproduces the exact same structure
    const roundTrip = parseDailyNoteToSections(markdown, sections);
    assert.equal(roundTrip.dateHeading, 'Aug 15, 2026');
    assert.equal(roundTrip.sections.length, 2);
    assert.equal(roundTrip.sections[0].id, 'nc_1');
    assert.equal(roundTrip.sections[0].indexTopic, 'Architecture');
    assert.equal(roundTrip.sections[0].heading, 'System Design');
    assert.equal(roundTrip.sections[0].content, sections[0].content);
    assert.equal(roundTrip.sections[1].id, 'nc_2');
    assert.equal(roundTrip.sections[1].heading, 'General Notes');
    assert.equal(roundTrip.sections[1].content, sections[1].content);
  });

  it('should return default sample sections when given empty note text', () => {
    const { dateHeading, sections } = parseDailyNoteToSections('');
    assert.equal(dateHeading, '');
    assert.equal(sections.length, 2);
    assert.equal(sections[0].id, 'nc_1');
    assert.equal(sections[1].id, 'nc_2');
  });

  it('should parse note text without headings into a General Notes section', () => {
    const rawText = 'First line without heading.\nSecond line.';
    const { sections } = parseDailyNoteToSections(rawText);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].heading, 'General Notes');
    assert.equal(sections[0].content, rawText);
  });
});
