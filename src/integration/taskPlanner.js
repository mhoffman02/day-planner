/**
 * @file taskPlanner.js
 * @description Pure planning of Google Task payloads from Gmail thread metadata (Phase 28).
 * Titles follow the Day Planner [A1]-[C9] convention (mirrors taskEngine.formatTaskTitle, which
 * cannot be imported here: engines only import siblings). Idempotency identity is an op-key stored
 * in a hidden dp-meta marker in the Task notes (same marker Code.gs decodeTaskMeta parses), so a
 * retry after a crash between Task create and ledger write finds the task instead of duplicating.
 * Stores only the Gmail link and subject, never message bodies.
 */

import { sanitizeError, stackFrames } from './ledger.js';

const TASK_PLANNER_PRIORITY_RE = /^([A-Ca-c])([1-9])$/;
const TASK_PLANNER_META_RE = /<!--dp-meta:(.*?)-->\n?/;
const TASK_PLANNER_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TASK_PLANNER_MAX_SUBJECT = 200;

function taskPlannerRequire(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`taskPlanner: ${name} is required`);
  return value;
}

function taskPlannerPriorityPrefix(priority) {
  if (priority === undefined || priority === null || priority === '') return '';
  let group;
  let seq;
  if (typeof priority === 'string') {
    const m = priority.trim().match(TASK_PLANNER_PRIORITY_RE);
    if (!m) throw new Error(`taskPlanner: invalid priority ${JSON.stringify(priority)} (expected A1..C9)`);
    group = m[1];
    seq = m[2];
  } else {
    group = String(priority.group || '');
    seq = String(priority.sequence);
    if (!TASK_PLANNER_PRIORITY_RE.test(group + seq)) {
      throw new Error(`taskPlanner: invalid priority ${JSON.stringify(priority)} (expected A1..C9)`);
    }
  }
  return `[${group.toUpperCase()}${seq}] `;
}

function taskPlannerTitle(thread, priority, prefixText) {
  const subject = String((thread && thread.subject) || '').trim().slice(0, TASK_PLANNER_MAX_SUBJECT) || '(no subject)';
  return `${taskPlannerPriorityPrefix(priority)}${prefixText || ''}${subject}`;
}

/**
 * Local calendar date (YYYY-MM-DD) of an instant in an IANA time zone.
 * @param {Date} now
 * @param {string} timeZone
 * @returns {string}
 */
export function taskPlannerLocalDate(now, timeZone) {
  taskPlannerRequire(timeZone, 'timeZone');
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Parses the dp-meta JSON marker from Task notes.
 * @param {string} notes
 * @returns {object} parsed meta, or {} when absent/unparseable
 */
export function taskPlannerReadMeta(notes) {
  const m = String(notes || '').match(TASK_PLANNER_META_RE);
  if (!m) return {};
  try {
    const parsed = JSON.parse(m[1]);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    // JSON.parse messages quote the notes, so log sanitized text + frames only.
    console.error(`taskPlanner: corrupt dp-meta JSON in Task notes, treating meta as empty: ${sanitizeError(err)}\n${stackFrames(err.stack)}`);
    return {};
  }
}

/**
 * Serializes dp-meta so no value can terminate the HTML comment early: after JSON.stringify,
 * "<" and ">" (and the U+2028/2029 line separators, which "." in the reader regex does not match)
 * are written as unicode escapes. JSON.parse reads them back unchanged.
 * @param {object} meta
 * @returns {string}
 */
function taskPlannerEncodeMeta(meta) {
  return JSON.stringify(meta)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function taskPlannerBuildNotes(thread, now, meta, tag) {
  const url = taskPlannerRequire(thread && thread.url, 'thread.url');
  const lines = [`Gmail: ${url}`, `Created: ${now.toISOString()}`];
  if (tag) lines.push('', tag);
  lines.push(`<!--dp-meta:${taskPlannerEncodeMeta(meta)}-->`);
  return lines.join('\n');
}

function taskPlannerDue(dateStr) {
  return `${dateStr}T00:00:00.000Z`;
}

/**
 * Finds a Task previously created for an op-key.
 * @param {Array<{notes?:string}>} tasks
 * @param {string} opKey
 * @returns {object|null}
 */
export function findExistingByOpKey(tasks, opKey) {
  taskPlannerRequire(opKey, 'opKey');
  for (const t of tasks || []) {
    if (taskPlannerReadMeta(t && t.notes).opKey === opKey) return t;
  }
  return null;
}

/**
 * Plans a Task from a labeled Gmail thread.
 * @param {{thread:{threadId:string, subject:string, url:string}, today?:boolean, priority?:string|{group:string,sequence:number}, existingTasks:Array<object>, opKey:string, now:Date, timeZone?:string}} a
 * @returns {{action:'CREATE', task:object}|{action:'EXISTS', task:object}}
 */
export function planTaskFromThread(a) {
  taskPlannerRequire(a.opKey, 'opKey');
  taskPlannerRequire(a.thread && a.thread.threadId, 'thread.threadId');
  const existing = findExistingByOpKey(a.existingTasks, a.opKey);
  if (existing) return { action: 'EXISTS', task: existing };
  const task = {
    title: taskPlannerTitle(a.thread, a.priority, ''),
    notes: taskPlannerBuildNotes(a.thread, a.now, { opKey: a.opKey, gmailThreadId: a.thread.threadId }, '')
  };
  if (a.today) task.due = taskPlannerDue(taskPlannerLocalDate(a.now, a.timeZone));
  return { action: 'CREATE', task };
}

/**
 * Plans a Waiting item: a Task tagged [Waiting] whose dp-meta records who is awaited and when to nag.
 * @param {{thread:object, waitingOn:string, nagDate:string, priority?:string|object, existingTasks:Array<object>, opKey:string, now:Date}} a
 * @returns {{action:'CREATE', task:object}|{action:'EXISTS', task:object}}
 */
export function planWaiting(a) {
  taskPlannerRequire(a.opKey, 'opKey');
  taskPlannerRequire(a.thread && a.thread.threadId, 'thread.threadId');
  taskPlannerRequire(a.waitingOn, 'waitingOn');
  if (!TASK_PLANNER_DATE_RE.test(String(a.nagDate))) {
    throw new Error(`taskPlanner: nagDate must be YYYY-MM-DD, got ${JSON.stringify(a.nagDate)}`);
  }
  const existing = findExistingByOpKey(a.existingTasks, a.opKey);
  if (existing) return { action: 'EXISTS', task: existing };
  const meta = {
    opKey: a.opKey,
    gmailThreadId: a.thread.threadId,
    waitingOn: a.waitingOn.trim(),
    nagDate: a.nagDate,
    gmailLink: taskPlannerRequire(a.thread.url, 'thread.url')
  };
  return {
    action: 'CREATE',
    task: {
      title: taskPlannerTitle(a.thread, a.priority, ''),
      notes: taskPlannerBuildNotes(a.thread, a.now, meta, '[Waiting]'),
      due: taskPlannerDue(a.nagDate)
    }
  };
}
