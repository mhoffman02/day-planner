/**
 * @file goalPlanner.js
 * @description Goals tab storage contract. Each goal is a Google Task in a dedicated "Day Planner
 * Goals" list (kept out of @default so goals never flood Master or Daily). Fields ride in the notes:
 * one tag line ([Goal] [Horizon: 1y] [Parent: id] [Area: ...] [Value: ...]) plus labeled lines
 * (Measure:, Purpose:, If-then:). Target date is the task due date; done is task completed.
 * Single source for the horizon and life-area lists: the server sends them to the client.
 * Source rules for Engines.gs: no double slash inside string or regex literals, no apostrophe or
 * backtick in comments.
 */

export const GOALS_LIST_TITLE = 'Day Planner Goals';

export const GOAL_HORIZONS = Object.freeze([
  Object.freeze({ key: 'someday', label: 'Someday', child: '5y' }),
  Object.freeze({ key: '5y', label: '5-Year', child: '1y' }),
  Object.freeze({ key: '1y', label: '1-Year', child: 'quarter' }),
  Object.freeze({ key: 'quarter', label: 'Quarter', child: null })
]);

export const GOAL_AREAS = Object.freeze(['Career', 'Finance', 'Family', 'Health', 'Friends', 'Growth', 'Fun', 'Community']);

const GOAL_STATUSES = ['open', 'done'];
const GOAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GOAL_TITLE_MAX = 200;
const GOAL_SHORT_MAX = 80;
const GOAL_TEXT_MAX = 1000;
const GOAL_LINES = [
  { key: 'measure', label: 'Measure' },
  { key: 'purpose', label: 'Purpose' },
  { key: 'ifThen', label: 'If-then' }
];

function goalHorizonIndex(key) {
  for (let i = 0; i < GOAL_HORIZONS.length; i++) {
    if (GOAL_HORIZONS[i].key === key) return i;
  }
  return -1;
}

/**
 * True when horizon `a` is longer-range than horizon `b` (a parent must be higher than its child).
 * @param {string} a Horizon key.
 * @param {string} b Horizon key.
 * @returns {boolean}
 */
export function isHigherHorizon(a, b) {
  const ia = goalHorizonIndex(a);
  const ib = goalHorizonIndex(b);
  if (ia === -1) throw new Error('goalPlanner: unknown horizon ' + JSON.stringify(a));
  if (ib === -1) throw new Error('goalPlanner: unknown horizon ' + JSON.stringify(b));
  return ia < ib;
}

/** One line, no brackets: a value can never forge a tag or a labeled line. */
function goalFlat(value) {
  return String(value === undefined || value === null ? '' : value).replace(/[\r\n]+/g, ' ').replace(/[[\]]/g, '').trim();
}

/**
 * Builds the notes body for a goal task.
 * @param {object} goal Goal fields (horizon required).
 * @returns {string}
 */
export function encodeGoalNotes(goal) {
  const tags = ['[Goal]', '[Horizon: ' + goalFlat(goal.horizon) + ']'];
  if (goalFlat(goal.parentId)) tags.push('[Parent: ' + goalFlat(goal.parentId) + ']');
  if (goalFlat(goal.area)) tags.push('[Area: ' + goalFlat(goal.area) + ']');
  if (goalFlat(goal.value)) tags.push('[Value: ' + goalFlat(goal.value) + ']');
  const lines = [tags.join(' ')];
  for (const f of GOAL_LINES) {
    const v = goalFlat(goal[f.key]);
    if (v) lines.push(f.label + ': ' + v);
  }
  return lines.join('\n');
}

function goalTag(notes, name) {
  const m = notes.match(new RegExp('\\[' + name + ':\\s*([^\\]]*)\\]', 'i'));
  return m ? m[1].trim() : '';
}

/**
 * Parses a goal task notes body.
 * @param {string} notes Raw notes.
 * @returns {{isGoal: boolean, horizon: string, parentId: (string|null), area: string, value: string, measure: string, purpose: string, ifThen: string}}
 */
export function decodeGoalNotes(notes) {
  const text = String(notes || '');
  const out = {
    isGoal: /\[Goal\]/i.test(text),
    horizon: goalTag(text, 'Horizon'),
    parentId: goalTag(text, 'Parent') || null,
    area: goalTag(text, 'Area'),
    value: goalTag(text, 'Value'),
    measure: '',
    purpose: '',
    ifThen: ''
  };
  for (const f of GOAL_LINES) {
    const m = text.match(new RegExp('^' + f.label + ':[ \\t]*(.*)$', 'm'));
    if (m) out[f.key] = m[1].trim();
  }
  return out;
}

/**
 * Maps a Google Task from the goals list to a goal, or null if it carries no [Goal] tag.
 * @param {object} task Tasks API resource.
 * @returns {object|null}
 */
export function goalFromTask(task) {
  const meta = decodeGoalNotes(task && task.notes);
  if (!meta.isGoal) return null;
  return {
    id: task.id,
    title: task.title || '',
    horizon: goalHorizonIndex(meta.horizon) === -1 ? 'someday' : meta.horizon,
    parentId: meta.parentId,
    area: meta.area,
    value: meta.value,
    measure: meta.measure,
    purpose: meta.purpose,
    ifThen: meta.ifThen,
    target: task.due ? String(task.due).slice(0, 10) : '',
    status: task.status === 'completed' ? 'done' : 'open',
    updated: task.updated || ''
  };
}

/**
 * Builds the Tasks API insert/patch body for a normalized goal.
 * @param {object} goal Normalized goal.
 * @returns {{title: string, notes: string, due: (string|null), status: string}}
 */
export function goalTaskResource(goal) {
  return {
    title: goal.title,
    notes: encodeGoalNotes(goal),
    due: goal.target ? goal.target + 'T00:00:00.000Z' : null,
    status: goal.status === 'done' ? 'completed' : 'needsAction'
  };
}

function goalText(input, key, max) {
  const v = input[key] === undefined || input[key] === null ? '' : String(input[key]).trim();
  if (v.length > max) throw new Error('goalPlanner: ' + key + ' is too long');
  return v;
}

function goalStatus(raw) {
  const status = raw === undefined || raw === null || raw === '' ? 'open' : String(raw);
  if (GOAL_STATUSES.indexOf(status) === -1) throw new Error('goalPlanner: unknown status ' + JSON.stringify(status));
  return status;
}

/**
 * Validates and trims client goal input. Throws an Error with a user-safe message on bad input.
 * @param {object} input Raw goal from the client.
 * @returns {object} Normalized goal (id kept when present).
 */
export function normalizeGoalInput(input) {
  if (!input || typeof input !== 'object') throw new Error('goalPlanner: goal must be an object');
  const title = goalText(input, 'title', GOAL_TITLE_MAX);
  if (!title) throw new Error('goalPlanner: title is required');
  const horizon = String(input.horizon || '');
  if (goalHorizonIndex(horizon) === -1) throw new Error('goalPlanner: unknown horizon ' + JSON.stringify(horizon));
  const area = goalText(input, 'area', GOAL_SHORT_MAX);
  if (area && GOAL_AREAS.indexOf(area) === -1) throw new Error('goalPlanner: unknown area ' + JSON.stringify(area));
  const target = goalText(input, 'target', 10);
  if (target && !GOAL_DATE_RE.test(target)) throw new Error('goalPlanner: target must be YYYY-MM-DD');
  const status = goalStatus(input.status);
  const parentId = goalText(input, 'parentId', GOAL_SHORT_MAX) || null;
  const id = goalText(input, 'id', GOAL_SHORT_MAX) || null;
  return {
    id: id,
    title: title,
    horizon: horizon,
    parentId: parentId,
    area: area,
    value: goalText(input, 'value', GOAL_SHORT_MAX),
    measure: goalText(input, 'measure', GOAL_TEXT_MAX),
    purpose: goalText(input, 'purpose', GOAL_TEXT_MAX),
    ifThen: goalText(input, 'ifThen', GOAL_TEXT_MAX),
    target: target,
    status: status
  };
}
