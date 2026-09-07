/**
 * @file futureMatrixEngine.test.js
 * @description Unit tests for the Future Planning Matrix (12-month overview) engine,
 * multi-quarter milestone tracking, and rolling horizon projections.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MONTH_KEYS,
  QUARTERS,
  monthKeyFor,
  createFutureItem,
  nextMonthKey,
  emptyYearMatrix,
  quarterForMonth,
  quarterKeyFor,
  getMonthsForQuarter,
  createMilestone,
  groupItemsByQuarter,
  trackMultiQuarterMilestones,
  generateRollingHorizon,
  projectRollingHorizon,
  rollForwardPendingItems,
  advanceQuarterKey,
  regressQuarterKey,
  updateMilestone,
  toggleMilestoneStatus,
  cycleMilestoneStatus,
  addDeliverable,
  toggleDeliverable,
  rescheduleMilestone
} from '../src/futureMatrixEngine.js';

describe('Future Matrix Engine Unit Tests', () => {
  it('should expose 12 zero-padded month keys in order', () => {
    assert.equal(MONTH_KEYS.length, 12);
    assert.equal(MONTH_KEYS[0], '01');
    assert.equal(MONTH_KEYS[11], '12');
  });

  it('should expose 4 quarters in order', () => {
    assert.deepEqual(QUARTERS, ['Q1', 'Q2', 'Q3', 'Q4']);
  });

  it('should build a YYYY-MM month key', () => {
    assert.equal(monthKeyFor(2026, 3), '2026-03');
    assert.equal(monthKeyFor(2026, 12), '2026-12');
  });

  it('should create a future item with default open status', () => {
    const item = createFutureItem('Book venue for June offsite', 'Work');
    assert.equal(item.title, 'Book venue for June offsite');
    assert.equal(item.category, 'Work');
    assert.equal(item.status, '•');
    assert.ok(item.id.startsWith('fm_'));
    assert.ok(item.createdAt);
  });

  it('should default category to General when omitted', () => {
    const item = createFutureItem('Renew passport');
    assert.equal(item.category, 'General');
  });

  it('should compute the next month key within the same year', () => {
    assert.equal(nextMonthKey('2026-03'), '2026-04');
  });

  it('should roll over into the next year after December', () => {
    assert.equal(nextMonthKey('2026-12'), '2027-01');
  });

  it('should build an empty 12-month matrix with every month pre-seeded', () => {
    const matrix = emptyYearMatrix(2026);
    assert.equal(matrix.year, '2026');
    assert.equal(Object.keys(matrix.months).length, 12);
    assert.deepEqual(matrix.months['2026-01'], []);
    assert.deepEqual(matrix.months['2026-12'], []);
  });

  describe('Multi-Quarter Milestone Tracking', () => {
    it('quarterForMonth correctly categorizes all 12 months', () => {
      assert.equal(quarterForMonth(1), 'Q1');
      assert.equal(quarterForMonth(3), 'Q1');
      assert.equal(quarterForMonth(4), 'Q2');
      assert.equal(quarterForMonth(6), 'Q2');
      assert.equal(quarterForMonth(7), 'Q3');
      assert.equal(quarterForMonth(9), 'Q3');
      assert.equal(quarterForMonth(10), 'Q4');
      assert.equal(quarterForMonth(12), 'Q4');

      // String and key formats
      assert.equal(quarterForMonth('02'), 'Q1');
      assert.equal(quarterForMonth('2026-08'), 'Q3');
    });

    it('quarterKeyFor formats year and quarter string correctly', () => {
      assert.equal(quarterKeyFor(2026, 1), '2026-Q1');
      assert.equal(quarterKeyFor(2026, 'Q2'), '2026-Q2');
      assert.equal(quarterKeyFor(2027, 4), '2027-Q4');
    });

    it('getMonthsForQuarter returns the correct 3 months for any quarter', () => {
      assert.deepEqual(getMonthsForQuarter(2026, 1), ['2026-01', '2026-02', '2026-03']);
      assert.deepEqual(getMonthsForQuarter(2026, 'Q2'), ['2026-04', '2026-05', '2026-06']);
      assert.deepEqual(getMonthsForQuarter(2026, 3), ['2026-07', '2026-08', '2026-09']);
      assert.deepEqual(getMonthsForQuarter(2026, 'Q4'), ['2026-10', '2026-11', '2026-12']);
    });

    it('createMilestone initializes milestone with calculated progress from deliverables', () => {
      const ms = createMilestone('Complete SOC2 Type II Audit', '2026-Q3', {
        category: 'Compliance',
        description: 'Complete readiness assessment and auditor fieldwork',
        targetMonth: '2026-09',
        deliverables: [
          { title: 'Readiness gap report', status: '✓' },
          { title: 'Remediate access controls', status: '✓' },
          { title: 'Auditor evidence collection', status: '•' },
          { title: 'Final auditor signoff', status: '•' }
        ]
      });

      assert.ok(ms.id.startsWith('ms_'));
      assert.equal(ms.title, 'Complete SOC2 Type II Audit');
      assert.equal(ms.targetQuarter, '2026-Q3');
      assert.equal(ms.category, 'Compliance');
      assert.equal(ms.status, '•');
      assert.equal(ms.progress, 50); // 2 of 4 deliverables completed
      assert.equal(ms.deliverables.length, 4);
    });

    it('groupItemsByQuarter buckets 12-month items into Q1-Q4 arrays', () => {
      const matrix = emptyYearMatrix(2026);
      matrix.months['2026-02'].push({ id: 'item1', title: 'Q1 goal' });
      matrix.months['2026-05'].push({ id: 'item2', title: 'Q2 goal' });
      matrix.months['2026-06'].push({ id: 'item3', title: 'Another Q2 goal' });
      matrix.months['2026-11'].push({ id: 'item4', title: 'Q4 goal' });

      const grouped = groupItemsByQuarter(matrix);
      assert.equal(grouped.Q1.length, 1);
      assert.equal(grouped.Q2.length, 2);
      assert.equal(grouped.Q3.length, 0);
      assert.equal(grouped.Q4.length, 1);
    });

    it('trackMultiQuarterMilestones categorizes milestones into current, upcoming, past, and overdue', () => {
      const milestones = [
        { id: 'm1', title: 'Old completed goal', targetQuarter: '2026-Q1', status: '✓', progress: 100 },
        { id: 'm2', title: 'Old uncompleted goal', targetQuarter: '2026-Q1', status: '•', progress: 30 },
        { id: 'm3', title: 'Active quarter goal', targetQuarter: '2026-Q2', status: '•', progress: 60 },
        { id: 'm4', title: 'Future quarter goal', targetQuarter: '2026-Q3', status: '•', progress: 0 }
      ];

      const report = trackMultiQuarterMilestones(milestones, '2026-Q2');
      assert.equal(report.current.length, 1);
      assert.equal(report.current[0].id, 'm3');

      assert.equal(report.upcoming.length, 1);
      assert.equal(report.upcoming[0].id, 'm4');

      assert.equal(report.past.length, 2);
      assert.equal(report.overdue.length, 1);
      assert.equal(report.overdue[0].id, 'm2'); // past but not completed

      assert.equal(report.stats.total, 4);
      assert.equal(report.stats.completed, 1);
      assert.equal(report.stats.open, 3);
      assert.equal(report.stats.completionRate, 25);
    });
  });

  describe('Rolling Horizon Projections', () => {
    it('generateRollingHorizon generates sequential months across year boundary', () => {
      const horizon = generateRollingHorizon('2026-10', 6);
      assert.equal(horizon.length, 6);

      assert.equal(horizon[0].monthKey, '2026-10');
      assert.equal(horizon[0].quarter, 'Q4');
      assert.equal(horizon[0].year, 2026);

      assert.equal(horizon[2].monthKey, '2026-12');
      assert.equal(horizon[2].year, 2026);

      // Year boundary crossing
      assert.equal(horizon[3].monthKey, '2027-01');
      assert.equal(horizon[3].year, 2027);
      assert.equal(horizon[3].quarter, 'Q1');

      assert.equal(horizon[5].monthKey, '2027-03');
      assert.equal(horizon[5].year, 2027);
    });

    it('projectRollingHorizon calculates month load density and pacing', () => {
      const horizon = generateRollingHorizon('2026-09', 3);
      const itemsByMonth = {
        '2026-09': [
          { id: '1', title: 'Task 1', status: '•' },
          { id: '2', title: 'Task 2', status: '✓' }
        ],
        '2026-10': Array.from({ length: 9 }, (_, i) => ({ id: `heavy_${i}`, title: `Item ${i}`, status: '•' })),
        '2026-11': [
          { id: '3', title: 'Task 3', status: '•' },
          { id: '4', title: 'Task 4', status: '•' },
          { id: '5', title: 'Task 5', status: '•' },
          { id: '6', title: 'Task 6', status: '•' }
        ]
      };

      const milestones = [
        { id: 'ms1', title: 'Q3 wrapup', targetMonth: '2026-09' }
      ];

      const projection = projectRollingHorizon(horizon, itemsByMonth, milestones);
      assert.equal(projection.horizon.length, 3);

      // Month 1: 2 items -> light pacing
      assert.equal(projection.horizon[0].monthKey, '2026-09');
      assert.equal(projection.horizon[0].loadCount, 2);
      assert.equal(projection.horizon[0].openCount, 1);
      assert.equal(projection.horizon[0].completedCount, 1);
      assert.equal(projection.horizon[0].pacing, 'light');
      assert.equal(projection.horizon[0].milestones.length, 1);

      // Month 2: 9 items -> heavy pacing
      assert.equal(projection.horizon[1].monthKey, '2026-10');
      assert.equal(projection.horizon[1].loadCount, 9);
      assert.equal(projection.horizon[1].pacing, 'heavy');

      // Month 3: 4 items -> moderate pacing
      assert.equal(projection.horizon[2].monthKey, '2026-11');
      assert.equal(projection.horizon[2].loadCount, 4);
      assert.equal(projection.horizon[2].pacing, 'moderate');

      // Summary
      assert.equal(projection.summary.totalItems, 15);
      assert.equal(projection.summary.totalMilestones, 1);
      assert.equal(projection.summary.peakMonth, '2026-10');
      assert.equal(projection.summary.averageItemsPerMonth, 5);
    });

    it('rollForwardPendingItems carries forward uncompleted items and marks source items deferred', () => {
      const items = [
        { id: 'it1', title: 'Finished item', status: '✓', category: 'Work' },
        { id: 'it2', title: 'Open item to roll', status: '•', category: 'Personal' },
        { id: 'it3', title: 'Cancelled item', status: 'X', category: 'General' }
      ];

      const { forwardedItems, updatedSourceItems } = rollForwardPendingItems('2026-08', '2026-09', items);

      assert.equal(forwardedItems.length, 1);
      assert.equal(forwardedItems[0].title, 'Open item to roll');
      assert.equal(forwardedItems[0].status, '•');
      assert.equal(forwardedItems[0].rolledFrom, '2026-08');
      assert.equal(forwardedItems[0].targetMonth, '2026-09');

      assert.equal(updatedSourceItems.find(i => i.id === 'it2').status, '→');
      assert.equal(updatedSourceItems.find(i => i.id === 'it1').status, '✓');
      assert.equal(updatedSourceItems.find(i => i.id === 'it3').status, 'X');
    });
  });

  describe('Quarter Arithmetic & Milestone Interactive Operations', () => {
    it('advanceQuarterKey correctly rolls forward quarters and rolls over year', () => {
      assert.equal(advanceQuarterKey('2026-Q1'), '2026-Q2');
      assert.equal(advanceQuarterKey('2026-Q3'), '2026-Q4');
      assert.equal(advanceQuarterKey('2026-Q4'), '2027-Q1');
      assert.equal(advanceQuarterKey('invalid'), 'invalid');
    });

    it('regressQuarterKey correctly rolls backward quarters and decrements year', () => {
      assert.equal(regressQuarterKey('2026-Q2'), '2026-Q1');
      assert.equal(regressQuarterKey('2026-Q4'), '2026-Q3');
      assert.equal(regressQuarterKey('2026-Q1'), '2025-Q4');
      assert.equal(regressQuarterKey('invalid'), 'invalid');
    });

    it('cycleMilestoneStatus cycles through Franklin states in order', () => {
      assert.equal(cycleMilestoneStatus('•'), '→');
      assert.equal(cycleMilestoneStatus('→'), '✓');
      assert.equal(cycleMilestoneStatus('✓'), 'X');
      assert.equal(cycleMilestoneStatus('X'), '•');
      assert.equal(cycleMilestoneStatus('unknown'), '•');
    });

    it('toggleMilestoneStatus toggles between completed and open, syncing deliverables', () => {
      const ms = createMilestone('Launch MVP', '2026-Q3', {
        deliverables: ['Design spec', 'Frontend implementation', 'E2E tests']
      });
      assert.equal(ms.status, '•');
      assert.equal(ms.progress, 0);

      // Toggle to complete
      const completedMs = toggleMilestoneStatus(ms);
      assert.equal(completedMs.status, '✓');
      assert.equal(completedMs.progress, 100);
      assert.ok(completedMs.deliverables.every(d => d.status === '✓'));

      // Toggle back to open
      const reopenedMs = toggleMilestoneStatus(completedMs);
      assert.equal(reopenedMs.status, '•');
      assert.equal(reopenedMs.progress, 0);
      assert.ok(reopenedMs.deliverables.every(d => d.status === '•'));
    });

    it('addDeliverable adds deliverable and updates milestone progress and status', () => {
      let ms = createMilestone('Infrastructure migration', '2026-Q2');
      assert.equal(ms.deliverables.length, 0);

      ms = addDeliverable(ms, 'Audit AWS resources');
      assert.equal(ms.deliverables.length, 1);
      assert.equal(ms.deliverables[0].title, 'Audit AWS resources');
      assert.equal(ms.deliverables[0].status, '•');
      assert.equal(ms.progress, 0);

      // Empty title should no-op
      const unchanged = addDeliverable(ms, '');
      assert.equal(unchanged.deliverables.length, 1);
    });

    it('toggleDeliverable toggles sub-task and dynamically updates milestone progress', () => {
      let ms = createMilestone('Quarterly Security Audit', '2026-Q4', {
        deliverables: ['Dependency check', 'Penetration test']
      });
      assert.equal(ms.progress, 0);
      assert.equal(ms.status, '•');

      const d1Id = ms.deliverables[0].id;
      const d2Id = ms.deliverables[1].id;

      // Check first deliverable (50%)
      ms = toggleDeliverable(ms, d1Id);
      assert.equal(ms.deliverables[0].status, '✓');
      assert.equal(ms.progress, 50);
      assert.equal(ms.status, '→');

      // Check second deliverable (100%)
      ms = toggleDeliverable(ms, d2Id);
      assert.equal(ms.deliverables[1].status, '✓');
      assert.equal(ms.progress, 100);
      assert.equal(ms.status, '✓');

      // Uncheck first deliverable (drops to 50%)
      ms = toggleDeliverable(ms, d1Id);
      assert.equal(ms.deliverables[0].status, '•');
      assert.equal(ms.progress, 50);
      assert.equal(ms.status, '→');
    });

    it('updateMilestone updates attributes and preserves id', () => {
      const ms = createMilestone('Initial Title', '2026-Q1', { category: 'General' });
      const updated = updateMilestone(ms, {
        title: 'Updated Title',
        category: 'Strategic',
        description: 'New description',
        targetQuarter: '2026-Q2',
        targetMonth: '2026-05'
      });

      assert.equal(updated.id, ms.id);
      assert.equal(updated.title, 'Updated Title');
      assert.equal(updated.category, 'Strategic');
      assert.equal(updated.description, 'New description');
      assert.equal(updated.targetQuarter, '2026-Q2');
      assert.equal(updated.targetMonth, '2026-05');
    });

    it('rescheduleMilestone updates targetQuarter and targetMonth', () => {
      const ms = createMilestone('Roadmap milestone', '2026-Q2');
      const rescheduled = rescheduleMilestone(ms, '2026-Q3', '2026-08');
      assert.equal(rescheduled.targetQuarter, '2026-Q3');
      assert.equal(rescheduled.targetMonth, '2026-08');
    });
  });
});
