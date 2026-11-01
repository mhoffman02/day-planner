/**
 * @file mutationKillers.test.js
 * @description Behavior tests written from Stryker survivors (npm run test:mutation) for
 * taskEngine.js and futureMatrixEngine.js: boundaries, defaults, status transitions and merge rules.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_STATUSES, STATUS_LIST, STATUS_OPTIONS, parseTaskTitle, extractTaskDetails, extractInlinePriority,
  formatTaskTitle, updateTaskTitleText, getNextStatus, sortTasks, getTaskSortValue, sortTasksByColumn,
  getNextSequence, forwardTaskToDate, transferMasterTaskToToday, filterTasksByStatus,
  filterTasksByDateHorizon, buildMasterTasksClearinghouse
} from '../src/taskEngine.js';
import {
  MONTH_KEYS, QUARTERS, monthKeyFor, createFutureItem, nextMonthKey, emptyYearMatrix, quarterForMonth,
  quarterKeyFor, getMonthsForQuarter, createMilestone, advanceQuarterKey, regressQuarterKey, updateMilestone,
  cycleMilestoneStatus, toggleMilestoneStatus, addDeliverable, toggleDeliverable, rescheduleMilestone,
  groupItemsByQuarter, trackMultiQuarterMilestones, generateRollingHorizon, projectRollingHorizon,
  rollForwardPendingItems
} from '../src/futureMatrixEngine.js';

describe('taskEngine survivors', () => {
  it('exposes the exact status glyphs and labels', () => {
    assert.deepEqual(TASK_STATUSES, {
      OPEN: '•', IN_PROGRESS: '○', COMPLETED: '✓', FORWARDED: '→', CANCELED: 'X', DELEGATED: 'Ⓓ'
    });
    assert.deepEqual(STATUS_LIST, ['•', '○', '✓', '→', 'X', 'Ⓓ']);
    assert.deepEqual(STATUS_OPTIONS.map(o => o.label), ['Open', 'In Progress', 'Done', 'Forward', 'Canceled', 'Delegated']);
    assert.deepEqual(STATUS_OPTIONS.map(o => o.value), STATUS_LIST);
  });

  it('parseTaskTitle only accepts a leading [A-C][1-9] prefix', () => {
    assert.equal(parseTaskTitle('see [A1] later').priorityCode, null);
    assert.equal(parseTaskTitle('[D1] x').priorityCode, null);
    assert.equal(parseTaskTitle('[A0] x').priorityCode, null);
    assert.equal(parseTaskTitle('[A10] x').priorityCode, null);
    assert.deepEqual(parseTaskTitle('[b3]Tight title  '), {
      priorityGroup: 'B', sequence: 3, priorityCode: 'B3', cleanTitle: 'Tight title'
    });
    assert.deepEqual(parseTaskTitle('  plain  '), {
      priorityGroup: null, sequence: null, priorityCode: null, cleanTitle: 'plain'
    });
    assert.deepEqual(parseTaskTitle(''), { priorityGroup: null, sequence: null, priorityCode: null, cleanTitle: '' });
  });

  it('extractTaskDetails splits on the first pipe only and rejects non-strings', () => {
    assert.deepEqual(extractTaskDetails(' a | b | c '), { rawTitle: 'a', notes: 'b | c' });
    assert.deepEqual(extractTaskDetails('  just title '), { rawTitle: 'just title', notes: '' });
    assert.deepEqual(extractTaskDetails(42), { rawTitle: '', notes: '' });
    assert.deepEqual(extractTaskDetails(''), { rawTitle: '', notes: '' });
  });

  it('extractInlinePriority handles separators, bare tags and non-tags', () => {
    assert.deepEqual(extractInlinePriority('#a: buy milk'), { priorityGroup: 'A', cleanTitle: 'buy milk' });
    assert.deepEqual(extractInlinePriority('#B - call'), { priorityGroup: 'B', cleanTitle: 'call' });
    assert.deepEqual(extractInlinePriority('  #c walk'), { priorityGroup: 'C', cleanTitle: 'walk' });
    assert.deepEqual(extractInlinePriority('#c'), { priorityGroup: 'C', cleanTitle: '' });
    assert.deepEqual(extractInlinePriority('#Ax nope', 'B'), { priorityGroup: 'B', cleanTitle: '#Ax nope' });
    assert.deepEqual(extractInlinePriority('#d nope'), { priorityGroup: 'A', cleanTitle: '#d nope' });
    assert.deepEqual(extractInlinePriority('x #a y', 'C'), { priorityGroup: 'C', cleanTitle: 'x #a y' });
    assert.deepEqual(extractInlinePriority('', 'C'), { priorityGroup: 'C', cleanTitle: '' });
  });

  it('formatTaskTitle needs both group and a non-zero sequence', () => {
    assert.equal(formatTaskTitle('b', 2, '  x '), '[B2] x');
    assert.equal(formatTaskTitle(null, 2, ' x '), 'x');
    assert.equal(formatTaskTitle('A', 0, 'x'), 'x');
    assert.equal(formatTaskTitle('A', 1, undefined), '[A1] ');
  });

  it('updateTaskTitleText keeps the prefix and ignores blank replacements', () => {
    assert.equal(updateTaskTitleText('[A1] old', ' new '), '[A1] new');
    assert.equal(updateTaskTitleText('[A1] old', '   '), '[A1] old');
    assert.equal(updateTaskTitleText('[A1] old', undefined), '[A1] old');
    assert.equal(updateTaskTitleText('plain', 'new'), 'new');
  });

  it('getNextStatus walks the whole cycle and wraps / recovers', () => {
    STATUS_LIST.forEach((s, i) => assert.equal(getNextStatus(s), STATUS_LIST[(i + 1) % 6]));
    assert.equal(getNextStatus('???'), '•');
  });

  it('sortTasks orders by group, sequence, then title, unprioritized last', () => {
    const t = (title) => ({ title });
    const out = sortTasks([t('zeta'), t('[B1] b1'), t('[A2] a2'), t('alpha'), t('[A1] zz'), t('[A1] aa'), t('[C1] c1')]);
    assert.deepEqual(out.map(x => x.title), ['[A1] aa', '[A1] zz', '[A2] a2', '[B1] b1', '[C1] c1', 'alpha', 'zeta']);
    assert.deepEqual(sortTasks(), []);
  });

  it('getTaskSortValue yields the documented key per column', () => {
    assert.equal(getTaskSortValue({ title: '[A1] x' }, 'priority'), 'A1');
    assert.equal(getTaskSortValue({ title: 'x' }, 'priority'), '�');
    assert.equal(getTaskSortValue({ status: '✓' }, 'status'), 2);
    assert.equal(getTaskSortValue({ status: 'nope' }, 'status'), 6);
    assert.equal(getTaskSortValue({ title: '[A1] Buy', starred: true }, 'title'), '★Buy');
    assert.equal(getTaskSortValue({ title: '[A1] Buy' }, 'title'), '☆Buy');
    assert.equal(getTaskSortValue({ title: '[A1]', starred: true }, 'title'), '★[A1]');
    assert.equal(getTaskSortValue({}, 'title'), '☆');
    assert.equal(getTaskSortValue({ category: 'Home' }, 'category'), 'Home');
    assert.equal(getTaskSortValue({}, 'category'), '');
    assert.equal(getTaskSortValue({ dueDate: '2026-01-02' }, 'dueDate'), '2026-01-02');
    assert.equal(getTaskSortValue({}, 'dueDate'), '￿');
    assert.equal(getTaskSortValue({ title: 'x' }, 'bogus'), '');
  });

  it('sortTasksByColumn sorts numerically by status and keeps ties stable both ways', () => {
    const tasks = [
      { id: 1, status: 'X' }, { id: 2, status: '•' }, { id: 3, status: 'X' }, { id: 4, status: '✓' }
    ];
    assert.deepEqual(sortTasksByColumn(tasks, 'status').map(t => t.id), [2, 4, 1, 3]);
    assert.deepEqual(sortTasksByColumn(tasks, 'status', 'desc').map(t => t.id), [1, 3, 4, 2]);
    assert.deepEqual(sortTasksByColumn([{ id: 1, category: 'b' }, { id: 2, category: 'a' }], 'category', 'desc').map(t => t.id), [1, 2]);
    assert.deepEqual(sortTasksByColumn(undefined, 'status'), []);
  });

  it('getNextSequence finds the first gap within the group and caps at 9', () => {
    const tasks = [{ title: '[A1] a' }, { title: '[A3] a' }, { title: '[B2] b' }, { title: 'plain' }];
    assert.equal(getNextSequence(tasks, 'A'), 2);
    assert.equal(getNextSequence(tasks, 'b'), 1);
    assert.equal(getNextSequence(tasks, 'C'), 1);
    assert.equal(getNextSequence([]), 1);
    const full = Array.from({ length: 9 }, (_, i) => ({ title: `[A${i + 1}] x` }));
    assert.equal(getNextSequence(full, 'A'), 9);
  });

  it('forwardTaskToDate creates an open task on the target day with the next free sequence', () => {
    const out = forwardTaskToDate({ id: 's1', title: '[B2] Pay rent', category: 'Home' }, [{ title: '[B1] x' }], '2026-03-04');
    assert.match(out.id, /^daily_\d+_/);
    assert.equal(out.title, '[B2] Pay rent');
    assert.equal(out.status, '•');
    assert.equal(out.dueDate, '2026-03-04');
    assert.equal(out.category, 'Home');
    assert.equal(out.forwardedFromId, 's1');
    const bare = forwardTaskToDate({ title: 'Bare' }, [{ title: '[A1] x' }], '2026-03-04');
    assert.equal(bare.title, '[A2] Bare');
    assert.equal(bare.category, 'General');
    assert.equal(bare.forwardedFromId, null);
    assert.equal(forwardTaskToDate({ title: '' }, [], 'd').title, '[A1] Untitled Task');
  });

  it('transferMasterTaskToToday assigns the requested group and records its source', () => {
    const out = transferMasterTaskToToday({ id: 'm1', title: '[A1] Plan', category: 'Work' }, [{ title: '[C1] x' }], 'C', '2026-05-06');
    assert.match(out.id, /^daily_\d+_/);
    assert.equal(out.title, '[C2] Plan');
    assert.equal(out.dueDate, '2026-05-06');
    assert.equal(out.status, '•');
    assert.equal(out.category, 'Work');
    assert.equal(out.sourceMasterId, 'm1');
    const bare = transferMasterTaskToToday({ title: '' }, undefined, undefined, 'x');
    assert.equal(bare.title, '[A1] Untitled Task');
    assert.equal(bare.category, 'General');
    assert.equal(bare.sourceMasterId, null);
  });

  it('filterTasksByStatus normalizes delegated glyphs and defaults missing status to open', () => {
    const tasks = [{ id: 1, status: 'Ⓓ' }, { id: 2, status: 'D/✓' }, { id: 3 }, { id: 4, status: '✓' }];
    assert.deepEqual(filterTasksByStatus(tasks, ['Ⓓ']).map(t => t.id), [1, 2]);
    assert.deepEqual(filterTasksByStatus(tasks, ['D/✓']).map(t => t.id), [1, 2]);
    assert.deepEqual(filterTasksByStatus(tasks, ['•']).map(t => t.id), [3]);
    assert.equal(filterTasksByStatus(tasks, null), tasks);
    assert.deepEqual(filterTasksByStatus(null, ['•']), []);
    assert.deepEqual(filterTasksByStatus('nope', ['•']), []);
  });

  it('filterTasksByDateHorizon treats today as overdue-today, not future, and uses movedTo', () => {
    const tasks = [
      { id: 'past', dueDate: '2026-01-01' }, { id: 'today', dueDate: '2026-02-02' },
      { id: 'future', dueDate: '2026-03-03' }, { id: 'moved', movedTo: '2026-04-04' }, { id: 'none' }
    ];
    const ids = (h) => filterTasksByDateHorizon(tasks, h, '2026-02-02').map(t => t.id);
    assert.deepEqual(ids('future'), ['future', 'moved']);
    assert.deepEqual(ids('overdue-today'), ['past', 'today']);
    assert.deepEqual(ids('undated'), ['none']);
    assert.deepEqual(ids('all'), ['past', 'today', 'future', 'moved', 'none']);
    assert.deepEqual(ids('bogus'), ['past', 'today', 'future', 'moved', 'none']);
    assert.deepEqual(ids(''), ['past', 'today', 'future', 'moved', 'none']);
    assert.deepEqual(filterTasksByDateHorizon(undefined, 'future'), []);
  });

  it('buildMasterTasksClearinghouse merges a master and its daily into one record, either input order', () => {
    const master = { id: 'm1', title: 'Master', movedTaskId: 'd1', status: '•', category: 'Work', notes: 'mn' };
    const daily = { id: 'd1', title: 'Daily', sourceMasterId: 'm1', dueDate: '2026-05-02', status: '○', starred: true, category: 'Home', notes: '' };
    const expected = [{
      id: 'm1', title: 'Daily', category: 'Home', status: '○', starred: true, notes: 'mn',
      dueDate: '2026-05-02', movedTo: '2026-05-02', movedTaskId: 'd1'
    }];
    assert.deepEqual(buildMasterTasksClearinghouse([master, daily]), expected);
    assert.deepEqual(buildMasterTasksClearinghouse([daily, master]), expected);
  });

  it('buildMasterTasksClearinghouse keeps open dated and all undated tasks, drops finished dated ones', () => {
    const out = buildMasterTasksClearinghouse([
      { id: 'dated', title: 'D', due: '2026-07-04T00:00:00.000Z' },
      { id: 'done', dueDate: '2026-07-05', status: '✓' },
      { id: 'canceled', dueDate: '2026-07-05', status: 'X' },
      { id: 'raw', dueDate: '2026-07-05', status: 'completed' },
      { id: 'rawStatus', dueDate: '2026-07-05', statusRaw: 'completed' },
      { id: 'undatedDone', title: 'U', status: '✓' },
      { id: 'moved', title: 'M', movedTo: '2026-06-01' }
    ]);
    assert.deepEqual(out.map(t => t.id), ['dated', 'undatedDone', 'moved']);
    assert.deepEqual(out[0], {
      id: 'dated', title: 'D', category: 'General', status: '•', starred: false, notes: '',
      dueDate: '2026-07-04', movedTo: null, movedTaskId: null
    });
    assert.equal(out[1].dueDate, null);
    assert.equal(out[1].status, '✓');
    assert.equal(out[2].dueDate, '2026-06-01');
    assert.equal(out[2].movedTo, '2026-06-01');
    assert.deepEqual(buildMasterTasksClearinghouse('x'), []);
  });
});

describe('futureMatrixEngine survivors', () => {
  it('builds month keys and year skeletons', () => {
    assert.equal(MONTH_KEYS.length, 12);
    assert.equal(MONTH_KEYS[0], '01');
    assert.equal(MONTH_KEYS[11], '12');
    assert.deepEqual(QUARTERS, ['Q1', 'Q2', 'Q3', 'Q4']);
    assert.equal(monthKeyFor(2026, 3), '2026-03');
    assert.equal(nextMonthKey('2026-09'), '2026-10');
    assert.equal(nextMonthKey('2026-12'), '2027-01');
    const m = emptyYearMatrix(2026);
    assert.equal(m.year, '2026');
    assert.equal(Object.keys(m.months).length, 12);
    assert.deepEqual(m.months['2026-07'], []);
    const item = createFutureItem('Big rock');
    assert.match(item.id, /^fm_/);
    assert.equal(item.category, 'General');
    assert.equal(item.status, '•');
    assert.ok(!Number.isNaN(Date.parse(item.createdAt)));
  });

  it('quarterForMonth maps boundaries and clamps junk input', () => {
    const expected = { 0: 'Q1', 1: 'Q1', 3: 'Q1', 4: 'Q2', 6: 'Q2', 7: 'Q3', 9: 'Q3', 10: 'Q4', 12: 'Q4', 13: 'Q4' };
    for (const [m, q] of Object.entries(expected)) assert.equal(quarterForMonth(Number(m)), q, `month ${m}`);
    assert.equal(quarterForMonth('2026-08'), 'Q3');
    assert.equal(quarterForMonth('11'), 'Q4');
    assert.equal(quarterForMonth('abc'), 'Q1');
    assert.equal(quarterForMonth(NaN), 'Q1');
  });

  it('quarterKeyFor and getMonthsForQuarter accept numbers and labels', () => {
    assert.equal(quarterKeyFor(2026, 3), '2026-Q3');
    assert.equal(quarterKeyFor(2026, 'q2'), '2026-Q2');
    assert.equal(quarterKeyFor(2026, 'Q4'), '2026-Q4');
    assert.deepEqual(getMonthsForQuarter(2026, 'Q4'), ['2026-10', '2026-11', '2026-12']);
    assert.deepEqual(getMonthsForQuarter(2026, 2), ['2026-04', '2026-05', '2026-06']);
    assert.deepEqual(getMonthsForQuarter(2026, 'junk'), ['2026-01', '2026-02', '2026-03']);
  });

  it('advance / regress quarter keys wrap years and pass through invalid keys', () => {
    assert.equal(advanceQuarterKey('2026-Q1'), '2026-Q2');
    assert.equal(advanceQuarterKey('2026-Q4'), '2027-Q1');
    assert.equal(regressQuarterKey('2026-Q2'), '2026-Q1');
    assert.equal(regressQuarterKey('2026-Q1'), '2025-Q4');
    assert.equal(advanceQuarterKey('bogus'), 'bogus');
    assert.equal(regressQuarterKey('2026-Q5'), '2026-Q5');
    assert.equal(advanceQuarterKey('x2026-Q1'), 'x2026-Q1');
    assert.equal(regressQuarterKey('2026-Q1x'), '2026-Q1x');
  });

  it('createMilestone normalizes deliverables and computes progress', () => {
    const ms = createMilestone('Ship', '2026-Q3', {
      category: 'Work', description: 'desc', targetMonth: '2026-09',
      deliverables: ['plain', { title: 'done', status: '✓' }, { id: 'keep', title: 'obj' }]
    });
    assert.match(ms.id, /^ms_/);
    assert.deepEqual(ms.deliverables.map(d => d.title), ['plain', 'done', 'obj']);
    assert.deepEqual(ms.deliverables.map(d => d.status), ['•', '✓', '•']);
    assert.match(ms.deliverables[0].id, /^dlv_/);
    assert.equal(ms.deliverables[2].id, 'keep');
    assert.equal(ms.progress, 33);
    assert.equal(ms.status, '•');
    assert.equal(ms.category, 'Work');
    assert.equal(ms.description, 'desc');
    assert.equal(ms.targetMonth, '2026-09');
    const bare = createMilestone('Bare', '2026-Q1');
    assert.equal(bare.category, 'General');
    assert.equal(bare.description, '');
    assert.equal(bare.targetMonth, null);
    assert.deepEqual(bare.deliverables, []);
    assert.equal(bare.progress, 0);
    const two = createMilestone('Two', '2026-Q1', { deliverables: [{ title: 'a', status: '✓' }, { title: 'b', status: '✓' }, { title: 'c' }] });
    assert.equal(two.progress, 67);
  });

  it('updateMilestone recomputes progress and status transitions from deliverables', () => {
    const base = { id: 'x', createdAt: 'c', title: 'T', status: '•', progress: 0, deliverables: [] };
    const part = updateMilestone(base, { deliverables: ['a', { title: 'b', status: '✓' }] });
    assert.equal(part.progress, 50);
    assert.equal(part.status, '•');
    assert.equal(part.id, 'x');
    assert.equal(part.createdAt, 'c');
    assert.equal(part.deliverables[0].title, 'a');
    assert.match(part.deliverables[0].id, /^dlv_/);
    const all = updateMilestone(base, { deliverables: [{ title: 'b', status: '✓' }] });
    assert.equal(all.progress, 100);
    assert.equal(all.status, '✓');
    const reopened = updateMilestone(all, { deliverables: [{ title: 'b', status: '✓' }, { title: 'c' }] });
    assert.equal(reopened.progress, 50);
    assert.equal(reopened.status, '→');
    const titleOnly = updateMilestone(part, { title: 'New' });
    assert.equal(titleOnly.progress, 50);
    assert.equal(titleOnly.title, 'New');
  });

  it('updateMilestone with no deliverables lets an explicit status drive progress', () => {
    const base = { title: 'T', status: '•', progress: 50, deliverables: [] };
    assert.equal(updateMilestone(base, { status: '✓' }).progress, 100);
    assert.equal(updateMilestone({ ...base, status: '✓' }, { status: '•' }).progress, 0);
    const mid = updateMilestone(base, { status: '→' });
    assert.equal(mid.progress, 50);
    assert.equal(mid.status, '→');
    const none = updateMilestone({ title: 'T', status: '→', progress: 40 }, {});
    assert.equal(none.status, '→');
    assert.equal(none.progress, 40);
  });

  it('cycleMilestoneStatus follows open -> in progress -> done -> canceled -> open', () => {
    assert.equal(cycleMilestoneStatus('•'), '→');
    assert.equal(cycleMilestoneStatus('→'), '✓');
    assert.equal(cycleMilestoneStatus('✓'), 'X');
    assert.equal(cycleMilestoneStatus('X'), '•');
    assert.equal(cycleMilestoneStatus('?'), '•');
  });

  it('toggleMilestoneStatus syncs every deliverable', () => {
    const open = { status: '→', progress: 30, deliverables: [{ id: 'a', status: '•' }, { id: 'b', status: '✓' }] };
    const done = toggleMilestoneStatus(open);
    assert.equal(done.status, '✓');
    assert.equal(done.progress, 100);
    assert.deepEqual(done.deliverables.map(d => d.status), ['✓', '✓']);
    assert.deepEqual(done.deliverables.map(d => d.id), ['a', 'b']);
    const back = toggleMilestoneStatus(done);
    assert.equal(back.status, '•');
    assert.equal(back.progress, 0);
    assert.deepEqual(back.deliverables.map(d => d.status), ['•', '•']);
    assert.deepEqual(toggleMilestoneStatus({ status: '•' }).deliverables, []);
  });

  it('addDeliverable trims, ignores blanks and reopens a finished milestone', () => {
    const ms = { status: '✓', progress: 100, deliverables: [{ id: 'a', title: 'a', status: '✓' }] };
    const added = addDeliverable(ms, '  second ');
    assert.equal(added.deliverables.length, 2);
    assert.equal(added.deliverables[1].title, 'second');
    assert.equal(added.deliverables[1].status, '•');
    assert.match(added.deliverables[1].id, /^dlv_/);
    assert.equal(added.progress, 50);
    assert.equal(added.status, '→');
    const fresh = addDeliverable({ status: '•', progress: 0 }, 'first');
    assert.equal(fresh.progress, 0);
    assert.equal(fresh.status, '•');
    const manualDone = addDeliverable({ status: '✓', progress: 100 }, 'x');
    assert.equal(manualDone.progress, 0);
    assert.equal(manualDone.status, '→');
    const blank = addDeliverable(ms, '   ');
    assert.deepEqual(blank, ms);
    assert.notEqual(blank, ms);
    assert.deepEqual(addDeliverable(ms), ms);
  });

  it('toggleDeliverable updates progress and milestone status both directions', () => {
    const ms = { status: '•', progress: 0, deliverables: [{ id: 'a', status: '•' }, { id: 'b', status: '•' }] };
    const one = toggleDeliverable(ms, 'a');
    assert.equal(one.progress, 50);
    assert.equal(one.status, '→');
    assert.deepEqual(one.deliverables.map(d => d.status), ['✓', '•']);
    const two = toggleDeliverable(one, 'b');
    assert.equal(two.progress, 100);
    assert.equal(two.status, '✓');
    const back = toggleDeliverable(two, 'b');
    assert.equal(back.progress, 50);
    assert.equal(back.status, '→');
    const solo = toggleDeliverable({ status: '✓', deliverables: [{ id: 'a', status: '✓' }] }, 'a');
    assert.equal(solo.progress, 0);
    assert.equal(solo.status, '•');
    const keep = toggleDeliverable({ status: '→', deliverables: [{ id: 'a', status: '•' }] }, 'nope');
    assert.equal(keep.progress, 0);
    assert.equal(keep.status, '→');
    const empty = toggleDeliverable({ status: '→' }, 'a');
    assert.equal(empty.progress, 0);
    assert.deepEqual(empty.deliverables, []);
  });

  it('rescheduleMilestone replaces quarter and month, defaulting month to null', () => {
    const ms = { id: 'x', targetQuarter: '2026-Q1', targetMonth: '2026-02', title: 'T' };
    assert.deepEqual(rescheduleMilestone(ms, '2026-Q3', '2026-08'), { id: 'x', targetQuarter: '2026-Q3', targetMonth: '2026-08', title: 'T' });
    assert.equal(rescheduleMilestone(ms, '2026-Q3').targetMonth, null);
  });

  it('groupItemsByQuarter collects month buckets in order and tolerates bad input', () => {
    const matrix = { year: '2026', months: {
      '2026-01': [{ id: 1 }], '2026-03': [{ id: 2 }], '2026-04': [{ id: 3 }], '2026-12': [{ id: 4 }, { id: 5 }], '2026-07': 'bad'
    } };
    const g = groupItemsByQuarter(matrix);
    assert.deepEqual(g.Q1.map(i => i.id), [1, 2]);
    assert.deepEqual(g.Q2.map(i => i.id), [3]);
    assert.deepEqual(g.Q3, []);
    assert.deepEqual(g.Q4.map(i => i.id), [4, 5]);
    assert.deepEqual(groupItemsByQuarter(null), { Q1: [], Q2: [], Q3: [], Q4: [] });
    assert.deepEqual(groupItemsByQuarter({ year: '2026' }), { Q1: [], Q2: [], Q3: [], Q4: [] });
  });

  it('trackMultiQuarterMilestones buckets relative to the active quarter', () => {
    const a = { id: 'a', targetQuarter: '2026-Q1', status: '✓' };
    const b = { id: 'b', targetQuarter: '2026-Q2', progress: 100, status: '→' };
    const c = { id: 'c', targetQuarter: '2026-Q2', status: '•', progress: 0 };
    const d = { id: 'd', targetQuarter: '2026-Q3', status: '•' };
    const e = { id: 'e', targetQuarter: '2026-Q1', status: 'X' };
    const f = { id: 'f', status: '•' };
    const r = trackMultiQuarterMilestones([a, b, c, d, e, f], '2026-Q2');
    const ids = (arr) => arr.map(x => x.id);
    assert.deepEqual(ids(r.current), ['b', 'c']);
    assert.deepEqual(ids(r.upcoming), ['d']);
    assert.deepEqual(ids(r.past), ['a', 'e', 'f']);
    assert.deepEqual(ids(r.overdue), ['f']);
    assert.deepEqual(Object.keys(r.byQuarter), ['2026-Q1', '2026-Q2', '2026-Q3', 'Unassigned']);
    assert.deepEqual(r.stats, { total: 6, completed: 2, open: 4, completionRate: 33 });
    const noActive = trackMultiQuarterMilestones([a, d]);
    assert.deepEqual(ids(noActive.current), ['a', 'd']);
    assert.deepEqual([noActive.upcoming, noActive.past, noActive.overdue], [[], [], []]);
    assert.deepEqual(trackMultiQuarterMilestones().stats, { total: 0, completed: 0, open: 0, completionRate: 0 });
  });

  it('generateRollingHorizon spans year ends and defaults to 12 months', () => {
    const h = generateRollingHorizon('2026-11', 3);
    assert.deepEqual(h, [
      { monthKey: '2026-11', year: 2026, month: 11, quarter: 'Q4', quarterKey: '2026-Q4', index: 0 },
      { monthKey: '2026-12', year: 2026, month: 12, quarter: 'Q4', quarterKey: '2026-Q4', index: 1 },
      { monthKey: '2027-01', year: 2027, month: 1, quarter: 'Q1', quarterKey: '2027-Q1', index: 2 }
    ]);
    assert.equal(generateRollingHorizon('2026-01').length, 12);
    assert.deepEqual(generateRollingHorizon('2026-01', 0), []);
  });

  it('projectRollingHorizon grades pacing at 4 and 8, counts open/done and finds the peak', () => {
    const mk = (statuses) => statuses.map((status, i) => ({ id: i, status }));
    const itemsByMonth = {
      '2026-01': mk(['•', '✓', 'X']),
      '2026-02': mk(['•', '•', '•', '•']),
      '2026-03': mk(['✓', '✓', 'X', '→', '→', '→', '→']),
      '2026-04': mk(['•', '•', '•', '•', '•', '•', '•', '•'])
    };
    const milestones = [
      { id: 'byMonth', targetMonth: '2026-02', targetQuarter: '2026-Q4' },
      { id: 'byQuarter', targetQuarter: '2026-Q1' },
      { id: 'both', targetMonth: '2026-03', targetQuarter: '2026-Q1' }
    ];
    const r = projectRollingHorizon(generateRollingHorizon('2026-01', 4), itemsByMonth, milestones);
    assert.deepEqual(r.horizon.map(s => s.pacing), ['light', 'moderate', 'moderate', 'heavy']);
    assert.deepEqual(r.horizon.map(s => s.loadCount), [3, 4, 7, 8]);
    assert.deepEqual(r.horizon.map(s => s.openCount), [1, 4, 4, 8]);
    assert.deepEqual(r.horizon.map(s => s.completedCount), [1, 0, 2, 0]);
    assert.deepEqual(r.horizon.map(s => s.milestones.map(m => m.id)), [
      ['byQuarter'], ['byMonth', 'byQuarter'], ['byQuarter', 'both'], []
    ]);
    assert.deepEqual(r.summary, {
      totalItems: 22, totalMilestones: 5, openItems: 17, completedItems: 3, peakMonth: '2026-04', averageItemsPerMonth: 5.5
    });
    assert.equal(r.horizon[0].monthKey, '2026-01');
    assert.equal(r.horizon[0].items.length, 3);
  });

  it('projectRollingHorizon handles empty input and keeps the first of tied peaks', () => {
    assert.deepEqual(projectRollingHorizon().summary, {
      totalItems: 0, totalMilestones: 0, openItems: 0, completedItems: 0, peakMonth: null, averageItemsPerMonth: 0
    });
    const r = projectRollingHorizon(generateRollingHorizon('2026-01', 2), { '2026-01': [{ status: '•' }], '2026-02': [{ status: '•' }] });
    assert.equal(r.summary.peakMonth, '2026-01');
    assert.equal(r.summary.averageItemsPerMonth, 1);
    const empty = projectRollingHorizon(generateRollingHorizon('2026-01', 3), {});
    assert.equal(empty.summary.peakMonth, '2026-01');
    assert.equal(empty.horizon[0].pacing, 'light');
    const third = projectRollingHorizon(generateRollingHorizon('2026-01', 3), { '2026-01': [{ status: '•' }] });
    assert.equal(third.summary.averageItemsPerMonth, 0.3);
  });

  it('rollForwardPendingItems forwards only pending items and marks sources forwarded', () => {
    const items = [
      { id: 'a', title: 'A', status: '•' }, { id: 'b', title: 'B', status: '✓' },
      { id: 'c', title: 'C', status: 'X' }, { id: 'd', title: 'D', status: '→', category: 'Work' }
    ];
    const r = rollForwardPendingItems('2026-08', '2026-09', items);
    assert.deepEqual(r.updatedSourceItems.map(i => [i.id, i.status]), [['a', '→'], ['b', '✓'], ['c', 'X'], ['d', '→']]);
    assert.deepEqual(r.forwardedItems.map(i => [i.title, i.category, i.status, i.rolledFrom, i.targetMonth]), [
      ['A', 'General', '•', '2026-08', '2026-09'],
      ['D', 'Work', '•', '2026-08', '2026-09']
    ]);
    assert.match(r.forwardedItems[0].id, /^fm_/);
    assert.ok(!Number.isNaN(Date.parse(r.forwardedItems[0].createdAt)));
    assert.notEqual(r.updatedSourceItems[1], items[1]);
    assert.deepEqual(rollForwardPendingItems('a', 'b'), { forwardedItems: [], updatedSourceItems: [] });
  });
});
