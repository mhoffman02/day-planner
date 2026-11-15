/**
 * @file goalEngine.test.js
 * @description Client-side Goals logic: the WBS outline, horizon counts, the SMART check, progress
 * roll-up and the life-area balance grid. Horizons are passed in (the server owns the list).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GOAL_HORIZONS } from '../src/integration/goalPlanner.js';
import {
  buildGoalTree,
  horizonCounts,
  smartCheck,
  rollupProgress,
  balanceByArea,
  descendantIds,
  childHorizonKey
} from '../src/goalEngine.js';

const g = (id, horizon, parentId = null, extra = {}) => ({
  id, title: id, horizon, parentId, area: '', value: '', measure: '', purpose: '', ifThen: '', target: '', status: 'open', ...extra
});

const GOALS = [
  g('lead', 'someday', null, { area: 'Career' }),
  g('role', '5y', 'lead', { area: 'Career', target: '2031-12-31' }),
  g('pmp', '1y', 'role', { area: 'Career', target: '2027-06-30' }),
  g('xagency', '1y', 'role', { area: 'Career', target: '2027-12-31' }),
  g('hours', 'quarter', 'pmp', { status: 'done', area: 'Career' }),
  g('exam', 'quarter', 'pmp', { area: 'Career' }),
  g('kids', 'someday', null, { area: 'Family' })
];

describe('buildGoalTree', () => {
  it('orders depth-first with WBS codes, siblings by target then title', () => {
    const rows = buildGoalTree(GOALS);
    assert.deepEqual(rows.map(r => r.goal.id), ['kids', 'lead', 'role', 'pmp', 'exam', 'hours', 'xagency']);
    assert.deepEqual(rows.map(r => r.wbs), ['1', '2', '2.1', '2.1.1', '2.1.1.1', '2.1.1.2', '2.1.2']);
    assert.deepEqual(rows.map(r => r.depth), [0, 0, 1, 2, 3, 3, 2]);
  });

  it('treats a goal whose parent is missing as a root, so nothing disappears', () => {
    const rows = buildGoalTree([g('orphan', '1y', 'gone')]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].depth, 0);
  });

  it('survives a parent cycle without looping, still listing every goal once', () => {
    const rows = buildGoalTree([g('a', '1y', 'b'), g('b', '1y', 'a')]);
    assert.deepEqual(rows.map(r => r.goal.id).sort(), ['a', 'b']);
  });

  it('reports childCount so the UI can show collapsed totals', () => {
    const rows = buildGoalTree(GOALS);
    assert.equal(rows.find(r => r.goal.id === 'pmp').childCount, 2);
    assert.equal(rows.find(r => r.goal.id === 'kids').childCount, 0);
  });

  it('skips descendants of collapsed goals', () => {
    const rows = buildGoalTree(GOALS, new Set(['pmp']));
    assert.deepEqual(rows.map(r => r.goal.id), ['kids', 'lead', 'role', 'pmp', 'xagency']);
  });
});

describe('horizonCounts', () => {
  it('counts open goals per horizon key, done goals excluded', () => {
    assert.deepEqual(horizonCounts(GOALS, GOAL_HORIZONS), { someday: 2, '5y': 1, '1y': 2, quarter: 1 });
  });
});

describe('childHorizonKey', () => {
  it('returns the next lower horizon, or null below Quarter', () => {
    assert.equal(childHorizonKey(GOAL_HORIZONS, '1y'), 'quarter');
    assert.equal(childHorizonKey(GOAL_HORIZONS, 'quarter'), null);
  });
});

describe('smartCheck', () => {
  it('passes every letter for a complete goal', () => {
    const res = smartCheck(g('x', '1y', 'p', { title: 'Earn PMP certification', measure: 'exam passed', ifThen: 'if busy then evening', target: '2027-06-30' }));
    assert.deepEqual(res.map(r => [r.key, r.ok]), [['S', true], ['M', true], ['A', true], ['R', true], ['T', true]]);
  });

  it('flags the missing pieces of a vague goal', () => {
    const res = smartCheck(g('x', '1y', null, { title: 'Get fit' }));
    assert.deepEqual(res.filter(r => !r.ok).map(r => r.key), ['S', 'M', 'A', 'R', 'T']);
    assert.ok(res.every(r => typeof r.text === 'string' && r.text.length > 0));
  });

  it('counts a governing value as relevance for a root goal', () => {
    const res = smartCheck(g('x', 'someday', null, { value: 'Health' }));
    assert.equal(res.find(r => r.key === 'R').ok, true);
  });
});

describe('rollupProgress', () => {
  it('is the share of done leaf descendants', () => {
    assert.equal(rollupProgress('pmp', GOALS), 0.5);
    assert.equal(rollupProgress('lead', GOALS), 1 / 3);
  });

  it('is 1 or 0 for a leaf by its own status', () => {
    assert.equal(rollupProgress('hours', GOALS), 1);
    assert.equal(rollupProgress('kids', GOALS), 0);
  });

  it('treats a done parent as complete regardless of children', () => {
    const goals = GOALS.map(x => x.id === 'pmp' ? { ...x, status: 'done' } : x);
    assert.equal(rollupProgress('pmp', goals), 1);
  });
});

describe('balanceByArea', () => {
  it('counts open goals per area and horizon, listing every area', () => {
    const grid = balanceByArea(GOALS, GOAL_HORIZONS, ['Career', 'Family', 'Friends']);
    assert.deepEqual(grid.find(r => r.area === 'Career').counts, { someday: 1, '5y': 1, '1y': 2, quarter: 1 });
    assert.deepEqual(grid.find(r => r.area === 'Friends').counts, { someday: 0, '5y': 0, '1y': 0, quarter: 0 });
  });

  it('flags an area whose lowest goal has nothing planned below it', () => {
    const goals = [g('f', '1y', null, { area: 'Friends' })];
    const grid = balanceByArea(goals, GOAL_HORIZONS, ['Friends']);
    assert.equal(grid[0].gap, true);
  });

  it('does not flag an area with no goals at all, or one that reaches Quarter', () => {
    const grid = balanceByArea(GOALS, GOAL_HORIZONS, ['Career', 'Friends']);
    assert.equal(grid.find(r => r.area === 'Career').gap, false);
    assert.equal(grid.find(r => r.area === 'Friends').gap, false);
  });
});

describe('descendantIds', () => {
  it('lists every descendant id', () => {
    assert.deepEqual(descendantIds('role', GOALS).sort(), ['exam', 'hours', 'pmp', 'xagency']);
    assert.deepEqual(descendantIds('kids', GOALS), []);
  });
});
