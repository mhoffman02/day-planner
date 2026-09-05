/**
 * @file taskEngine.test.js
 * @description Unit tests for task title priority parsing, formatting, status cycling, task sorting, and master task transfer.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTaskTitle,
  formatTaskTitle,
  getNextStatus,
  sortTasks,
  getTaskSortValue,
  sortTasksByColumn,
  getNextSequence,
  transferMasterTaskToToday,
  forwardTaskToDate,
  TASK_STATUSES,
  STATUS_LIST,
  STATUS_OPTIONS,
  isValidStatus
} from '../src/taskEngine.js';

describe('Task Engine Unit Tests', () => {
  it('should correctly parse priority prefixes from task titles', () => {
    const parsedA1 = parseTaskTitle('[A1] Review quarterly roadmap');
    assert.equal(parsedA1.priorityGroup, 'A');
    assert.equal(parsedA1.sequence, 1);
    assert.equal(parsedA1.priorityCode, 'A1');
    assert.equal(parsedA1.cleanTitle, 'Review quarterly roadmap');

    const parsedC9 = parseTaskTitle('[c9] Call vendor support');
    assert.equal(parsedC9.priorityGroup, 'C');
    assert.equal(parsedC9.sequence, 9);
    assert.equal(parsedC9.priorityCode, 'C9');
    assert.equal(parsedC9.cleanTitle, 'Call vendor support');

    const unprioritized = parseTaskTitle('Buy printer paper');
    assert.equal(unprioritized.priorityGroup, null);
    assert.equal(unprioritized.sequence, null);
    assert.equal(unprioritized.cleanTitle, 'Buy printer paper');
  });

  it('should format task title with priority prefix', () => {
    const formatted = formatTaskTitle('B', 3, 'Draft project charter');
    assert.equal(formatted, '[B3] Draft project charter');

    const raw = formatTaskTitle(null, null, 'No priority task');
    assert.equal(raw, 'No priority task');
  });

  it('should cycle through task status codes accurately', () => {
    assert.equal(getNextStatus('•'), '○');
    assert.equal(getNextStatus('○'), '✓');
    assert.equal(getNextStatus('✓'), '→');
    assert.equal(getNextStatus('→'), 'X');
    assert.equal(getNextStatus('X'), 'D/✓');
    assert.equal(getNextStatus('D/✓'), '•');
  });

  it('should validate direct status jumps against STATUS_LIST (isValidStatus)', () => {
    for (const status of STATUS_LIST) {
      assert.equal(isValidStatus(status), true);
    }
    assert.equal(isValidStatus('bogus'), false);
    assert.equal(isValidStatus(''), false);
    assert.equal(isValidStatus(undefined), false);
    assert.equal(isValidStatus(null), false);
  });

  it('should expose one STATUS_OPTIONS entry per STATUS_LIST glyph, in the same order', () => {
    assert.equal(STATUS_OPTIONS.length, STATUS_LIST.length);
    STATUS_OPTIONS.forEach((opt, i) => {
      assert.equal(opt.value, STATUS_LIST[i]);
      assert.equal(typeof opt.label, 'string');
      assert.ok(opt.label.length > 0);
    });
  });

  it('should sort tasks correctly by priority group (A-C) and sequence (1-9)', () => {
    const tasks = [
      { title: '[C1] Low priority item' },
      { title: 'Unprioritized task' },
      { title: '[A2] Second urgent task' },
      { title: '[A1] Top urgent task' },
      { title: '[B1] Medium priority task' }
    ];

    const sorted = sortTasks(tasks);
    assert.equal(sorted[0].title, '[A1] Top urgent task');
    assert.equal(sorted[1].title, '[A2] Second urgent task');
    assert.equal(sorted[2].title, '[B1] Medium priority task');
    assert.equal(sorted[3].title, '[C1] Low priority item');
    assert.equal(sorted[4].title, 'Unprioritized task');
  });

  it('should find next available sequence integer', () => {
    const existing = [
      { title: '[A1] First' },
      { title: '[A2] Second' }
    ];
    assert.equal(getNextSequence(existing, 'A'), 3);
    assert.equal(getNextSequence(existing, 'B'), 1);
  });

  it('should transfer master task to daily task with priority assignment', () => {
    const masterTask = { id: 'm123', title: 'Prepare Q3 budget report', category: 'Financial' };
    const dailyTasks = [{ title: '[A1] Team sync' }];

    const transferred = transferMasterTaskToToday(masterTask, dailyTasks, 'A', '2026-08-15');
    assert.equal(transferred.title, '[A2] Prepare Q3 budget report');
    assert.equal(transferred.status, TASK_STATUSES.OPEN);
    assert.equal(transferred.dueDate, '2026-08-15');
    assert.equal(transferred.category, 'Financial');
    assert.equal(transferred.sourceMasterId, 'm123');
  });

  it('should return the null-field shape for empty/falsy titles from parseTaskTitle', () => {
    const empty = parseTaskTitle('');
    assert.deepEqual(empty, { priorityGroup: null, sequence: null, priorityCode: null, cleanTitle: '' });
    assert.deepEqual(parseTaskTitle(), empty);
  });

  it('should reject out-of-range or malformed priority prefixes as unprioritized', () => {
    const outOfRange = parseTaskTitle('[D1] Not a real group');
    assert.equal(outOfRange.priorityGroup, null);
    assert.equal(outOfRange.cleanTitle, '[D1] Not a real group');

    const zeroSeq = parseTaskTitle('[A0] Zero is not 1-9');
    assert.equal(zeroSeq.priorityGroup, null);
    assert.equal(zeroSeq.cleanTitle, '[A0] Zero is not 1-9');
  });

  it('should treat an unrecognized status as reset to OPEN when cycling', () => {
    assert.equal(getNextStatus('some-unknown-status'), '•');
    assert.equal(getNextStatus(undefined), '•');
  });

  it('should cap next sequence at 9 once a priority group is fully saturated', () => {
    const fullGroupA = Array.from({ length: 9 }, (_, i) => ({ title: `[A${i + 1}] Task ${i + 1}` }));
    assert.equal(getNextSequence(fullGroupA, 'A'), 9);
    assert.equal(getNextSequence([], 'c'), 1); // lowercase group letter is normalized
  });

  it('should sort tasks with identical priority codes by clean title alphabetically', () => {
    const tasks = [
      { title: '[A1] Zebra task' },
      { title: '[A1] Alpha task' }
    ];
    const sorted = sortTasks(tasks);
    assert.equal(sorted[0].title, '[A1] Alpha task');
    assert.equal(sorted[1].title, '[A1] Zebra task');
  });

  it('should fall back to raw title and default category when transferring an unprefixed/uncategorized master task', () => {
    const masterTask = { id: 'm999', title: 'Untitled master item' };
    const transferred = transferMasterTaskToToday(masterTask, [], 'B', '2026-08-20');
    assert.equal(transferred.title, '[B1] Untitled master item');
    assert.equal(transferred.category, 'General');
    assert.equal(transferred.sourceMasterId, 'm999');
  });

  it('should forward a daily task to a target date, preserving its priority group and category', () => {
    const sourceTask = { id: 't1', title: '[B2] Review vendor contract', category: 'Work' };
    const forwarded = forwardTaskToDate(sourceTask, [], '2026-08-21');
    assert.equal(forwarded.title, '[B1] Review vendor contract');
    assert.equal(forwarded.status, TASK_STATUSES.OPEN);
    assert.equal(forwarded.dueDate, '2026-08-21');
    assert.equal(forwarded.category, 'Work');
    assert.equal(forwarded.forwardedFromId, 't1');
  });

  it('should assign the next open sequence in the target priority group when forwarding onto a day that already has tasks', () => {
    const sourceTask = { id: 't2', title: '[A1] Finish slide deck', category: 'Work' };
    const existingTargetDayTasks = [{ id: 'x1', title: '[A1] Existing target-day task' }];
    const forwarded = forwardTaskToDate(sourceTask, existingTargetDayTasks, '2026-08-21');
    assert.equal(forwarded.title, '[A2] Finish slide deck');
  });

  it('should default an unprefixed/uncategorized forwarded task to priority A and category General', () => {
    const sourceTask = { id: 't3', title: 'Untitled task' };
    const forwarded = forwardTaskToDate(sourceTask, [], '2026-08-21');
    assert.equal(forwarded.title, '[A1] Untitled task');
    assert.equal(forwarded.category, 'General');
  });

  it('getTaskSortValue() should sort unprioritized tasks last under the priority column', () => {
    const prioritized = { title: '[B2] Something' };
    const unprioritized = { title: 'No prefix' };
    assert.equal(getTaskSortValue(prioritized, 'priority'), 'B2');
    assert.ok(getTaskSortValue(unprioritized, 'priority') > 'C9');
  });

  it('getTaskSortValue() should rank status by STATUS_LIST order, unknown statuses last', () => {
    assert.equal(getTaskSortValue({ status: '•' }, 'status'), STATUS_LIST.indexOf('•'));
    assert.equal(getTaskSortValue({ status: 'D/✓' }, 'status'), STATUS_LIST.indexOf('D/✓'));
    assert.equal(getTaskSortValue({ status: 'bogus' }, 'status'), STATUS_LIST.length);
  });

  it('getTaskSortValue() should prefix the clean title with a star glyph so starred tasks cluster together on title sort', () => {
    assert.equal(getTaskSortValue({ title: '[A1] Ship it', starred: true }, 'title'), '★Ship it');
    assert.equal(getTaskSortValue({ title: '[A1] Ship it', starred: false }, 'title'), '☆Ship it');
  });

  it('getTaskSortValue() should read category directly, defaulting to an empty string', () => {
    assert.equal(getTaskSortValue({ category: 'Work' }, 'category'), 'Work');
    assert.equal(getTaskSortValue({}, 'category'), '');
  });

  it('sortTasksByColumn() should sort ascending/descending by the given column and stay stable on ties', () => {
    const tasks = [
      { id: 't1', title: '[B1] Bravo', category: 'Work' },
      { id: 't2', title: '[A1] Alpha', category: 'Work' },
      { id: 't3', title: '[C1] Charlie', category: 'Home' }
    ];
    const asc = sortTasksByColumn(tasks, 'priority', 'asc');
    assert.deepEqual(asc.map(t => t.id), ['t2', 't1', 't3']);

    const desc = sortTasksByColumn(tasks, 'priority', 'desc');
    assert.deepEqual(desc.map(t => t.id), ['t3', 't1', 't2']);

    // t1/t2 share category 'Work'; t3 is 'Home'. Ties keep their original relative order
    // (t1 before t2) in both directions, rather than .reverse()'s effect of flipping tie order
    // along with everything else.
    const tiedAsc = sortTasksByColumn(tasks, 'category', 'asc');
    assert.deepEqual(tiedAsc.map(t => t.id), ['t3', 't1', 't2']);
    const tiedDesc = sortTasksByColumn(tasks, 'category', 'desc');
    assert.deepEqual(tiedDesc.map(t => t.id), ['t1', 't2', 't3']);
  });

  it('sortTasksByColumn() should cluster starred tasks first on an ascending title sort', () => {
    const tasks = [
      { id: 't1', title: 'Zebra task', starred: false },
      { id: 't2', title: 'Alpha task', starred: true },
      { id: 't3', title: 'Middle task', starred: false }
    ];
    const sorted = sortTasksByColumn(tasks, 'title', 'asc');
    assert.equal(sorted[0].id, 't2');
  });
});
