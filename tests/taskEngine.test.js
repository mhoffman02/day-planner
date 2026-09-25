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
  isValidStatus,
  extractInlinePriority,
  filterTasksByStatus,
  filterTasksByDateHorizon,
  buildMasterTasksClearinghouse
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
    assert.equal(getNextStatus('X'), 'Ⓓ');
    assert.equal(getNextStatus('Ⓓ'), '•');
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

    const delegatedOpt = STATUS_OPTIONS.find(opt => opt.value === 'Ⓓ');
    assert.ok(delegatedOpt);
    assert.equal(delegatedOpt.label, 'Delegated');
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
    assert.equal(getTaskSortValue({ status: 'Ⓓ' }, 'status'), STATUS_LIST.indexOf('Ⓓ'));
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

  it('getTaskSortValue() should return dueDate for dueDate sort, undated last', () => {
    assert.equal(getTaskSortValue({ dueDate: '2026-09-28' }, 'dueDate'), '2026-09-28');
    assert.equal(getTaskSortValue({}, 'dueDate'), '\uFFFF');
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

  describe('extractInlinePriority', () => {
    it('should extract #A, #B, #C and lower case #a, #b, #c priority prefixes', () => {
      const resA = extractInlinePriority('#a Call vendor');
      assert.equal(resA.priorityGroup, 'A');
      assert.equal(resA.cleanTitle, 'Call vendor');

      const resB = extractInlinePriority('#B Prepare presentation');
      assert.equal(resB.priorityGroup, 'B');
      assert.equal(resB.cleanTitle, 'Prepare presentation');

      const resC = extractInlinePriority('#c File expense report');
      assert.equal(resC.priorityGroup, 'C');
      assert.equal(resC.cleanTitle, 'File expense report');
    });

    it('should support colon and dash separators (#A: / #b - )', () => {
      const resColon = extractInlinePriority('#a: Call vendor');
      assert.equal(resColon.priorityGroup, 'A');
      assert.equal(resColon.cleanTitle, 'Call vendor');

      const resDash = extractInlinePriority('#b - Prepare presentation');
      assert.equal(resDash.priorityGroup, 'B');
      assert.equal(resDash.cleanTitle, 'Prepare presentation');
    });

    it('should handle prefix only without title (#b)', () => {
      const res = extractInlinePriority('#b');
      assert.equal(res.priorityGroup, 'B');
      assert.equal(res.cleanTitle, '');
    });

    it('should not extract priority from regular hashtag words (#accounting)', () => {
      const res = extractInlinePriority('#accounting audit');
      assert.equal(res.priorityGroup, 'A');
      assert.equal(res.cleanTitle, '#accounting audit');
    });

    it('should retain default priority when no inline prefix exists', () => {
      const res = extractInlinePriority('Regular task title', 'B');
      assert.equal(res.priorityGroup, 'B');
      assert.equal(res.cleanTitle, 'Regular task title');

      const empty = extractInlinePriority('', 'C');
      assert.equal(empty.priorityGroup, 'C');
      assert.equal(empty.cleanTitle, '');
    });
  });

  describe('filterTasksByStatus', () => {
    const sampleTasks = [
      { id: 't1', title: '[A1] Open task', status: '•' },
      { id: 't2', title: '[A2] In progress task', status: '○' },
      { id: 't3', title: '[B1] Completed task', status: '✓' },
      { id: 't4', title: '[B2] Forwarded task', status: '→' },
      { id: 't5', title: '[C1] Cancelled task', status: 'X' },
      { id: 't6', title: '[C2] Delegated task unicode', status: 'Ⓓ' },
      { id: 't7', title: '[C3] Delegated task legacy text', status: 'D/✓' },
      { id: 't8', title: '[A3] Untagged status task' }
    ];

    it('should return all tasks when all statuses are active', () => {
      const active = ['•', '○', '✓', '→', 'X', 'Ⓓ'];
      const filtered = filterTasksByStatus(sampleTasks, active);
      assert.equal(filtered.length, 8);
    });

    it('should filter to only open tasks when only • is active', () => {
      const filtered = filterTasksByStatus(sampleTasks, ['•']);
      assert.equal(filtered.length, 2); // t1 and t8 (defaults to •)
      assert.deepEqual(filtered.map(t => t.id), ['t1', 't8']);
    });

    it('should filter to completed and forwarded tasks', () => {
      const filtered = filterTasksByStatus(sampleTasks, ['✓', '→']);
      assert.equal(filtered.length, 2);
      assert.deepEqual(filtered.map(t => t.id), ['t3', 't4']);
    });

    it('should handle normalization between Ⓓ and D/✓ for delegated tasks', () => {
      const filteredWithUnicode = filterTasksByStatus(sampleTasks, ['Ⓓ']);
      assert.equal(filteredWithUnicode.length, 2);
      assert.deepEqual(filteredWithUnicode.map(t => t.id), ['t6', 't7']);

      const filteredWithLegacy = filterTasksByStatus(sampleTasks, ['D/✓']);
      assert.equal(filteredWithLegacy.length, 2);
      assert.deepEqual(filteredWithLegacy.map(t => t.id), ['t6', 't7']);
    });

    it('should return empty array when no statuses match or filter is empty', () => {
      const emptyFilter = filterTasksByStatus(sampleTasks, []);
      assert.equal(emptyFilter.length, 0);

      const noMatch = filterTasksByStatus(sampleTasks, ['NONEXISTENT']);
      assert.equal(noMatch.length, 0);
    });

    it('should handle invalid or empty inputs gracefully', () => {
      assert.deepEqual(filterTasksByStatus(null, ['•']), []);
      assert.deepEqual(filterTasksByStatus([], ['•']), []);
      assert.deepEqual(filterTasksByStatus(sampleTasks, null), sampleTasks);
    });
  });

  describe('filterTasksByDateHorizon', () => {
    const horizonTasks = [
      { id: 't_past', title: 'Overdue task', dueDate: '2026-08-10' },
      { id: 't_today', title: 'Today task', dueDate: '2026-08-15' },
      { id: 't_future', title: 'Future task', dueDate: '2026-08-20' },
      { id: 't_undated', title: 'Undated task', dueDate: null }
    ];
    const today = '2026-08-15';

    it('should return all tasks when horizon is all', () => {
      const res = filterTasksByDateHorizon(horizonTasks, 'all', today);
      assert.equal(res.length, 4);
    });

    it('should filter future tasks (dueDate > today)', () => {
      const res = filterTasksByDateHorizon(horizonTasks, 'future', today);
      assert.equal(res.length, 1);
      assert.equal(res[0].id, 't_future');
    });

    it('should filter overdue and today tasks (dueDate <= today)', () => {
      const res = filterTasksByDateHorizon(horizonTasks, 'overdue-today', today);
      assert.equal(res.length, 2);
      assert.deepEqual(res.map(t => t.id), ['t_past', 't_today']);
    });

    it('should filter undated tasks (!dueDate)', () => {
      const res = filterTasksByDateHorizon(horizonTasks, 'undated', today);
      assert.equal(res.length, 1);
      assert.equal(res[0].id, 't_undated');
    });

    it('should handle empty or invalid inputs gracefully', () => {
      assert.deepEqual(filterTasksByDateHorizon(null, 'all'), []);
      assert.deepEqual(filterTasksByDateHorizon([], 'future'), []);
    });
  });

  describe('buildMasterTasksClearinghouse', () => {
    it('should combine undated backlog tasks with incomplete dated tasks across all dates', () => {
      const raw = [
        { id: 'm1', title: 'Undated backlog task', status: '•' },
        { id: 't_overdue', title: 'Overdue task', status: '•', due: '2026-08-01T00:00:00.000Z' },
        { id: 't_future', title: 'Future task', status: '○', dueDate: '2026-09-30' }
      ];
      const result = buildMasterTasksClearinghouse(raw, '2026-08-15');
      assert.equal(result.length, 3);
      assert.equal(result.find(t => t.id === 'm1').dueDate, null);
      assert.equal(result.find(t => t.id === 't_overdue').dueDate, '2026-08-01');
      assert.equal(result.find(t => t.id === 't_future').dueDate, '2026-09-30');
    });

    it('should exclude completed and canceled dated tasks from clearinghouse', () => {
      const raw = [
        { id: 't_done', title: 'Finished yesterday', status: '✓', due: '2026-08-14T00:00:00.000Z' },
        { id: 't_canceled', title: 'Dropped', status: 'X', dueDate: '2026-08-10' },
        { id: 't_open', title: 'Still open', status: '•', dueDate: '2026-08-14' }
      ];
      const result = buildMasterTasksClearinghouse(raw, '2026-08-15');
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 't_open');
    });

    it('should deduplicate and collapse moved master tasks with their daily task', () => {
      const raw = [
        { id: 'm1', title: '[A1] Plan retreat', status: '→', movedTo: '2026-08-20', movedTaskId: 't100' },
        { id: 't100', title: '[A1] Plan retreat', status: '○', dueDate: '2026-08-20', sourceMasterId: 'm1' }
      ];
      const result = buildMasterTasksClearinghouse(raw, '2026-08-15');
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'm1');
      assert.equal(result[0].status, '○');
      assert.equal(result[0].dueDate, '2026-08-20');
      assert.equal(result[0].movedTo, '2026-08-20');
      assert.equal(result[0].movedTaskId, 't100');
    });

    it('should preserve undated completed tasks for master tasks status filter viewing', () => {
      const raw = [
        { id: 'm_done', title: 'Archival done backlog item', status: '✓' }
      ];
      const result = buildMasterTasksClearinghouse(raw, '2026-08-15');
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'm_done');
      assert.equal(result[0].status, '✓');
    });
  });
});


