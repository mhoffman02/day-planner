/**
 * @file goalsServer.test.js
 * @description Goals RPCs in gas-app/Code.gs against the in-memory Tasks fake: the dedicated goals
 * list is found or created once and cached; saves enforce horizon order; deletes refuse goals that
 * still have sub-goals; steps sent to Today or Future carry a [GoalRef] tag that the task shapes
 * expose and the display notes hide.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGasContext, loadGasFile, loadEngines, toHost } from './helpers/gasRuntimeStubs.js';

function ctx() {
  const c = makeGasContext();
  loadEngines(c);
  loadGasFile(c, 'Code.gs');
  return c;
}

test('getGoals creates the "Day Planner Goals" list once, caches its id, and returns the lists', () => {
  const c = ctx();
  const first = toHost(c.getGoals());
  assert.deepEqual(first.goals, []);
  assert.deepEqual(first.horizons.map(h => h.key), ['someday', '5y', '1y', 'quarter']);
  assert.equal(first.areas.length, 8);
  c.getGoals();
  assert.equal(c.__fakes.tasklists.length, 1);
  assert.equal(c.__fakes.tasklists[0].title, 'Day Planner Goals');
  assert.equal(c.PropertiesService.getUserProperties().getProperty('DP_GOALS_TASKLIST_ID'), c.__fakes.tasklists[0].id);
});

test('getGoals reuses an existing list found by title instead of creating a duplicate', () => {
  const c = ctx();
  c.Tasks.Tasklists.insert({ title: 'Day Planner Goals' });
  c.getGoals();
  assert.equal(c.__fakes.tasklists.length, 1);
});

test('getGoals re-resolves when the cached list id was deleted', () => {
  const c = ctx();
  c.getGoals();
  c.PropertiesService.getUserProperties().setProperty('DP_GOALS_TASKLIST_ID', 'gone');
  const res = toHost(c.getGoals());
  assert.deepEqual(res.goals, []);
  assert.notEqual(c.PropertiesService.getUserProperties().getProperty('DP_GOALS_TASKLIST_ID'), 'gone');
});

test('saveGoal inserts into the goals list, never @default, and getGoals reads it back', () => {
  const c = ctx();
  const saved = toHost(c.saveGoal({ title: 'Lead a digital services team', horizon: 'someday', area: 'Career' }));
  assert.ok(saved.id);
  const listId = c.PropertiesService.getUserProperties().getProperty('DP_GOALS_TASKLIST_ID');
  assert.equal(c.__fakes.tasks.find(t => t.id === saved.id).tasklist, listId);
  const goals = toHost(c.getGoals()).goals;
  assert.equal(goals.length, 1);
  assert.equal(goals[0].title, 'Lead a digital services team');
  assert.equal(goals[0].area, 'Career');
});

test('getGoals ignores non-goal tasks someone added to the goals list by hand', () => {
  const c = ctx();
  c.getGoals();
  const listId = c.PropertiesService.getUserProperties().getProperty('DP_GOALS_TASKLIST_ID');
  c.Tasks.Tasks.insert({ title: 'stray', notes: 'plain' }, listId);
  assert.deepEqual(toHost(c.getGoals()).goals, []);
});

test('saveGoal updates in place when an id is given', () => {
  const c = ctx();
  const saved = toHost(c.saveGoal({ title: 'Run a half marathon', horizon: '1y' }));
  const updated = toHost(c.saveGoal({ ...saved, measure: '21.1 km under 2:15', target: '2027-10-10' }));
  assert.equal(updated.id, saved.id);
  assert.equal(updated.target, '2027-10-10');
  assert.equal(toHost(c.getGoals()).goals.length, 1);
});

test('saveGoal refuses a parent that is not a longer horizon', () => {
  const c = ctx();
  const parent = toHost(c.saveGoal({ title: 'Quarter thing', horizon: 'quarter' }));
  assert.throws(() => c.saveGoal({ title: 'Year thing', horizon: '1y', parentId: parent.id }), /longer-range/);
});

test('saveGoal refuses a parent id that is not a goal', () => {
  const c = ctx();
  assert.throws(() => c.saveGoal({ title: 'Year thing', horizon: '1y', parentId: 'nope' }), /parent goal not found/);
});

test('saveGoal refuses to raise a sub-goal to its parent level or lower a parent onto its children', () => {
  const c = ctx();
  const parent = toHost(c.saveGoal({ title: 'Five year plan here', horizon: '5y' }));
  toHost(c.saveGoal({ title: 'One year goal here', horizon: '1y', parentId: parent.id }));
  assert.throws(() => c.saveGoal({ ...parent, horizon: '1y' }), /sub-goals/);
});

test('saveGoal rejects bad input with a validation error before touching Tasks', () => {
  const c = ctx();
  assert.throws(() => c.saveGoal('not an object'), /goal/);
  assert.throws(() => c.saveGoal({ title: '', horizon: '1y' }), /title is required/);
});

test('deleteGoal removes a leaf goal and refuses one with sub-goals', () => {
  const c = ctx();
  const parent = toHost(c.saveGoal({ title: 'Parent goal here', horizon: '5y' }));
  const child = toHost(c.saveGoal({ title: 'Child goal here', horizon: '1y', parentId: parent.id }));
  assert.throws(() => c.deleteGoal(parent.id), /sub-goals/);
  c.deleteGoal(child.id);
  c.deleteGoal(parent.id);
  assert.deepEqual(toHost(c.getGoals()).goals, []);
});

test('addGoalStepToToday creates a @default daily task tagged with the goal, exposed as goalRef', () => {
  const c = ctx();
  const goal = toHost(c.saveGoal({ title: 'Earn PMP certification', horizon: '1y' }));
  const task = toHost(c.addGoalStepToToday(goal.id, 'Chapter 5 practice exam', '2026-11-16'));
  assert.equal(task.goalRef, goal.id);
  assert.equal(task.dueDate, '2026-11-16');
  const raw = c.__fakes.tasks.find(t => t.id === task.id);
  assert.equal(raw.tasklist, undefined);
  assert.match(raw.notes, new RegExp('\\[GoalRef: ' + goal.id + '\\]'));
  assert.doesNotMatch(task.notes, /GoalRef/);
});

test('addGoalStepToToday refuses an unknown goal', () => {
  const c = ctx();
  c.getGoals();
  assert.throws(() => c.addGoalStepToToday('nope', 'x', '2026-11-16'), /goal not found/);
});

test('addGoalStepToFuture creates a [Future] item in the month, tagged with the goal', () => {
  const c = ctx();
  const goal = toHost(c.saveGoal({ title: 'Run a half marathon', horizon: '1y' }));
  const item = toHost(c.addGoalStepToFuture(goal.id, 'Doctor check', '2026-12'));
  assert.equal(item.goalRef, goal.id);
  assert.equal(item.dueDate, '2026-12-31');
  const raw = c.__fakes.tasks.find(t => t.id === item.id);
  assert.match(raw.notes, /\[Future\]/);
  assert.match(raw.notes, /\[GoalRef: /);
});

test('daily data exposes goalRef on linked tasks and null on plain ones', () => {
  const c = ctx();
  const goal = toHost(c.saveGoal({ title: 'Earn PMP certification', horizon: '1y' }));
  c.addGoalStepToToday(goal.id, 'Linked', '2026-11-16');
  c.addDailyTask('2026-11-16', 'Plain');
  const day = toHost(c.getDailyData('2026-11-16'));
  const byTitle = Object.fromEntries(day.tasks.map(t => [t.title, t]));
  assert.equal(byTitle.Linked.goalRef, goal.id);
  assert.equal(byTitle.Plain.goalRef, null);
});

test('rpc guards reject wrong argument types', () => {
  const c = ctx();
  assert.throws(() => c.deleteGoal(5), /goalId/);
  assert.throws(() => c.addGoalStepToToday('g', 'x', 'tomorrow'), /dateStr/);
  assert.throws(() => c.addGoalStepToFuture('g', 'x', 'Dec'), /monthKey/);
});
