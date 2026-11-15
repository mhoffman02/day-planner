/**
 * @file goalPlanner.test.js
 * @description Goals live as Google Tasks in a dedicated "Day Planner Goals" list; their fields ride
 * in human-readable notes tags and labeled lines. These tests pin the codec, the input validation
 * and the horizon ordering the server relies on.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOAL_HORIZONS,
  GOAL_AREAS,
  GOALS_LIST_TITLE,
  encodeGoalNotes,
  decodeGoalNotes,
  goalFromTask,
  goalTaskResource,
  normalizeGoalInput,
  isHigherHorizon
} from '../src/integration/goalPlanner.js';

const FULL = {
  title: 'Earn PMP certification',
  horizon: '1y',
  parentId: 'p123',
  area: 'Career',
  value: 'Mastery',
  measure: 'Exam passed',
  purpose: 'Trusted with a team',
  ifThen: 'If a meeting lands on study time, then move it to the evening',
  target: '2027-06-30',
  status: 'open'
};

describe('GOAL_HORIZONS', () => {
  it('runs from Someday down to Quarter, each naming the next lower horizon', () => {
    assert.deepEqual(GOAL_HORIZONS.map(h => h.key), ['someday', '5y', '1y', 'quarter']);
    assert.deepEqual(GOAL_HORIZONS.map(h => h.child), ['5y', '1y', 'quarter', null]);
    assert.ok(Object.isFrozen(GOAL_HORIZONS));
  });

  it('lists the eight life areas', () => {
    assert.equal(GOAL_AREAS.length, 8);
    assert.ok(GOAL_AREAS.includes('Friends'));
  });

  it('names the dedicated Tasks list', () => {
    assert.equal(GOALS_LIST_TITLE, 'Day Planner Goals');
  });
});

describe('isHigherHorizon', () => {
  it('is true only when the first horizon is longer-range than the second', () => {
    assert.equal(isHigherHorizon('someday', '1y'), true);
    assert.equal(isHigherHorizon('1y', '1y'), false);
    assert.equal(isHigherHorizon('quarter', '5y'), false);
  });

  it('throws on an unknown horizon', () => {
    assert.throws(() => isHigherHorizon('decade', '1y'), /unknown horizon/);
  });
});

describe('encodeGoalNotes / decodeGoalNotes', () => {
  it('round-trips every field', () => {
    const notes = encodeGoalNotes(FULL);
    const back = decodeGoalNotes(notes);
    for (const k of ['horizon', 'parentId', 'area', 'value', 'measure', 'purpose', 'ifThen']) {
      assert.equal(back[k], FULL[k], k);
    }
    assert.equal(back.isGoal, true);
  });

  it('writes readable tags and labeled lines', () => {
    const notes = encodeGoalNotes(FULL);
    assert.match(notes, /^\[Goal\] \[Horizon: 1y\] \[Parent: p123\] \[Area: Career\] \[Value: Mastery\]$/m);
    assert.match(notes, /^Purpose: Trusted with a team$/m);
    assert.match(notes, /^If-then: If a meeting/m);
  });

  it('omits empty optional fields', () => {
    const notes = encodeGoalNotes({ title: 'x', horizon: 'someday' });
    assert.equal(notes, '[Goal] [Horizon: someday]');
    const back = decodeGoalNotes(notes);
    assert.equal(back.parentId, null);
    assert.equal(back.purpose, '');
  });

  it('flattens newlines and strips brackets so a value cannot forge a tag or a line', () => {
    const notes = encodeGoalNotes({ title: 'x', horizon: '1y', value: 'Big ] [Parent: evil]', purpose: 'one\nMeasure: forged' });
    const back = decodeGoalNotes(notes);
    assert.equal(back.parentId, null);
    assert.equal(back.measure, '');
    assert.equal(back.purpose, 'one Measure: forged');
    assert.equal(back.value, 'Big  Parent: evil');
  });

  it('reports a note without the [Goal] tag as not a goal', () => {
    assert.equal(decodeGoalNotes('just notes').isGoal, false);
    assert.equal(decodeGoalNotes('').isGoal, false);
  });
});

describe('goalFromTask', () => {
  it('maps a Google Task to a goal, taking target from due and done from completed', () => {
    const task = { id: 't1', title: 'Earn PMP', notes: encodeGoalNotes(FULL), due: '2027-06-30T00:00:00.000Z', status: 'completed', updated: '2026-11-15T10:00:00.000Z' };
    const g = goalFromTask(task);
    assert.equal(g.id, 't1');
    assert.equal(g.title, 'Earn PMP');
    assert.equal(g.target, '2027-06-30');
    assert.equal(g.status, 'done');
    assert.equal(g.horizon, '1y');
  });

  it('returns null for a task that is not a goal', () => {
    assert.equal(goalFromTask({ id: 'x', title: 'y', notes: 'plain' }), null);
  });

  it('falls back to someday when the horizon tag is missing or unknown', () => {
    const g = goalFromTask({ id: 'x', title: 'y', notes: '[Goal] [Horizon: decade]' });
    assert.equal(g.horizon, 'someday');
  });
});

describe('goalTaskResource', () => {
  it('builds the Tasks API body with due at local midnight UTC-tagged', () => {
    const r = goalTaskResource(FULL);
    assert.equal(r.title, FULL.title);
    assert.equal(r.due, '2027-06-30T00:00:00.000Z');
    assert.equal(r.status, 'needsAction');
    assert.match(r.notes, /\[Goal\]/);
  });

  it('sends due null when there is no target, so a cleared date is cleared', () => {
    assert.equal(goalTaskResource({ title: 'x', horizon: 'someday' }).due, null);
  });

  it('marks a done goal completed', () => {
    assert.equal(goalTaskResource({ ...FULL, status: 'done' }).status, 'completed');
  });
});

describe('normalizeGoalInput', () => {
  it('trims and keeps a valid goal', () => {
    const g = normalizeGoalInput({ ...FULL, title: '  Earn PMP  ' });
    assert.equal(g.title, 'Earn PMP');
    assert.equal(g.horizon, '1y');
  });

  it('rejects an empty title', () => {
    assert.throws(() => normalizeGoalInput({ ...FULL, title: '   ' }), /title is required/);
  });

  it('rejects an unknown horizon', () => {
    assert.throws(() => normalizeGoalInput({ ...FULL, horizon: 'decade' }), /unknown horizon/);
  });

  it('rejects an unknown area', () => {
    assert.throws(() => normalizeGoalInput({ ...FULL, area: 'Hobbies' }), /unknown area/);
  });

  it('rejects a malformed target date', () => {
    assert.throws(() => normalizeGoalInput({ ...FULL, target: '6/30/2027' }), /target must be YYYY-MM-DD/);
  });

  it('caps long text fields', () => {
    assert.throws(() => normalizeGoalInput({ ...FULL, purpose: 'x'.repeat(1001) }), /purpose is too long/);
  });

  it('defaults optional fields', () => {
    const g = normalizeGoalInput({ title: 'Lead a team', horizon: 'someday' });
    assert.deepEqual(
      { parentId: g.parentId, area: g.area, value: g.value, target: g.target, status: g.status },
      { parentId: null, area: '', value: '', target: '', status: 'open' }
    );
  });

  it('rejects an unknown status', () => {
    assert.throws(() => normalizeGoalInput({ ...FULL, status: 'paused' }), /unknown status/);
  });
});
