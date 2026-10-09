import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gmailTaskKey, gmailWaitingKey } from '../src/integration/contracts.js';
import { formatTaskTitle, parseTaskTitle } from '../src/taskEngine.js';
import {
  planTaskFromThread, findExistingByOpKey, planWaiting, taskPlannerLocalDate, taskPlannerReadMeta
} from '../src/integration/taskPlanner.js';
import { runOperation, beginOp } from '../src/integration/ledger.js';

const thread = { threadId: 'thr1', subject: 'Budget review', url: 'https://mail.google.com/mail/u/0/#inbox/thr1' };
const NOW = new Date('2026-10-06T12:00:00Z');
const TZ = 'America/Los_Angeles';

test('(h) title matches taskEngine convention and parses back', () => {
  const plan = planTaskFromThread({ thread, priority: 'A1', opKey: gmailTaskKey('thr1'), existingTasks: [], now: NOW, timeZone: TZ });
  assert.equal(plan.action, 'CREATE');
  assert.equal(plan.task.title, formatTaskTitle('A', 1, 'Budget review'));
  assert.deepEqual(parseTaskTitle(plan.task.title).priorityCode, 'A1');
  const obj = planTaskFromThread({ thread, priority: { group: 'c', sequence: 3 }, opKey: gmailTaskKey('thr1'), existingTasks: [], now: NOW, timeZone: TZ });
  assert.equal(obj.task.title, '[C3] Budget review');
  const none = planTaskFromThread({ thread, opKey: gmailTaskKey('thr1'), existingTasks: [], now: NOW, timeZone: TZ });
  assert.equal(none.task.title, 'Budget review');
  assert.throws(() => planTaskFromThread({ thread, priority: 'Z9', opKey: 'k', existingTasks: [], now: NOW, timeZone: TZ }), /priority/);
});

test('notes carry Gmail URL, creation timestamp and dp-meta op-key marker', () => {
  const key = gmailTaskKey('thr1');
  const { task } = planTaskFromThread({ thread, priority: 'B2', opKey: key, existingTasks: [], now: NOW, timeZone: TZ });
  assert.ok(task.notes.includes(thread.url));
  assert.ok(task.notes.includes('2026-10-06T12:00:00.000Z'));
  assert.match(task.notes, /<!--dp-meta:\{.*\}-->/);
  const meta = taskPlannerReadMeta(task.notes);
  assert.equal(meta.opKey, key);
  assert.equal(meta.gmailThreadId, 'thr1');
  // decodes with the exact regex Code.gs uses
  const m = task.notes.match(/<!--dp-meta:(.*?)-->\n?/);
  assert.equal(JSON.parse(m[1]).opKey, key);
});

test('(h) Task-Today due date uses the configured timezone around midnight UTC', () => {
  const key = gmailTaskKey('thr1', true);
  const lateEvening = new Date('2026-10-07T03:30:00Z'); // 8:30pm Oct 6 in LA
  const t = planTaskFromThread({ thread, today: true, priority: 'A1', opKey: key, existingTasks: [], now: lateEvening, timeZone: TZ });
  assert.equal(t.task.due, '2026-10-06T00:00:00.000Z');
  const morning = new Date('2026-10-07T08:30:00Z'); // 1:30am Oct 7 in LA
  assert.equal(planTaskFromThread({ thread, today: true, opKey: key, existingTasks: [], now: morning, timeZone: TZ }).task.due, '2026-10-07T00:00:00.000Z');
  assert.equal(taskPlannerLocalDate(new Date('2026-10-07T00:00:01Z'), TZ), '2026-10-06');
  assert.equal(taskPlannerLocalDate(new Date('2026-10-07T07:00:00Z'), TZ), '2026-10-07');
  const noDue = planTaskFromThread({ thread, opKey: gmailTaskKey('thr1'), existingTasks: [], now: NOW, timeZone: TZ });
  assert.equal(noDue.task.due, undefined);
  assert.throws(() => planTaskFromThread({ thread, today: true, opKey: key, existingTasks: [], now: NOW }), /timeZone/);
});

test('findExistingByOpKey matches only the exact op-key in dp-meta', () => {
  const key = gmailTaskKey('thr1');
  const { task } = planTaskFromThread({ thread, opKey: key, existingTasks: [], now: NOW, timeZone: TZ });
  const other = planTaskFromThread({ thread: { ...thread, threadId: 'thr2' }, opKey: gmailTaskKey('thr2'), existingTasks: [], now: NOW, timeZone: TZ }).task;
  const tasks = [{ id: 'a', title: 'x', notes: 'no meta' }, { id: 'b', ...other }, { id: 'c', ...task }, { id: 'd', notes: '<!--dp-meta:{bad-->' }];
  assert.equal(findExistingByOpKey(tasks, key).id, 'c');
  assert.equal(findExistingByOpKey(tasks, 'GMAIL|zzz|TASK'), null);
  assert.equal(findExistingByOpKey([], key), null);
});

test('(c) crash between Task create and ledger write: retry finds task by op-key, no duplicate', () => {
  const key = gmailTaskKey('thr1');
  const tasksApi = [];
  const rows = new Map();
  const T = (m) => new Date(NOW.getTime() + m * 60000);
  let crash = true;
  const store = {
    get: (k) => rows.get(k) || null,
    put: (r) => { if (crash && r.Status === 'DONE') throw new Error('crash before ledger write'); rows.set(r.OperationKey, r); }
  };
  const lock = { tryLock: () => true, releaseLock: () => {} };
  const op = { opKey: key, sourceType: 'GMAIL', sourceId: 'thr1', action: 'CREATE_TASK', targetType: 'TASK' };
  const work = () => {
    const plan = planTaskFromThread({ thread, priority: 'A1', opKey: key, existingTasks: tasksApi, now: NOW, timeZone: TZ });
    if (plan.action === 'CREATE') tasksApi.push({ id: `t${tasksApi.length + 1}`, ...plan.task });
    return { targetId: plan.action === 'CREATE' ? tasksApi[tasksApi.length - 1].id : plan.task.id, targetType: 'TASK' };
  };
  assert.throws(() => runOperation({ store, lock, clock: () => NOW, op, work }), /crash before ledger/);
  assert.equal(tasksApi.length, 1);
  crash = false;
  const r = runOperation({ store, lock, clock: () => T(30), op, work });
  assert.equal(r.action, 'DONE');
  assert.equal(tasksApi.length, 1);
  assert.equal(rows.get(key).TargetId, 't1');
  assert.equal(beginOp(op, NOW).Status, 'PENDING');
});

test('planWaiting: [Waiting] tag + dp-meta {waitingOn, nagDate, gmailLink}', () => {
  const key = gmailWaitingKey('thr1');
  const plan = planWaiting({ thread, waitingOn: 'Pat Lee', nagDate: '2026-10-13', priority: 'B1', opKey: key, existingTasks: [], now: NOW, timeZone: TZ });
  assert.equal(plan.action, 'CREATE');
  assert.ok(plan.task.notes.includes('[Waiting]'));
  const meta = taskPlannerReadMeta(plan.task.notes);
  assert.equal(meta.waitingOn, 'Pat Lee');
  assert.equal(meta.nagDate, '2026-10-13');
  assert.equal(meta.gmailLink, thread.url);
  assert.equal(meta.opKey, key);
  assert.equal(plan.task.due, '2026-10-13T00:00:00.000Z');
  assert.ok(plan.task.title.startsWith('[B1] '));
  const again = planWaiting({ thread, waitingOn: 'Pat Lee', nagDate: '2026-10-13', opKey: key, existingTasks: [{ id: 'w1', ...plan.task }], now: NOW, timeZone: TZ });
  assert.equal(again.action, 'EXISTS');
  assert.equal(again.task.id, 'w1');
  assert.throws(() => planWaiting({ thread, nagDate: '2026-10-13', opKey: key, existingTasks: [], now: NOW, timeZone: TZ }), /waitingOn/);
  assert.throws(() => planWaiting({ thread, waitingOn: 'x', nagDate: '10/13', opKey: key, existingTasks: [], now: NOW, timeZone: TZ }), /nagDate/);
});
