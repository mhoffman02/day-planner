import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTaskTitle,
  formatTaskTitle,
  getNextStatus,
  sortTasks,
  getNextSequence,
  transferMasterTaskToToday,
  TASK_STATUSES
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
    assert.equal(getNextStatus('•'), '✓');
    assert.equal(getNextStatus('✓'), '→');
    assert.equal(getNextStatus('→'), 'X');
    assert.equal(getNextStatus('X'), 'G/✓');
    assert.equal(getNextStatus('G/✓'), '•');
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
});
