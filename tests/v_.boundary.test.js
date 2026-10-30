// E2E at real module boundaries: wrap actual exported functions with v_ in a test-only harness
// (production engines are not edited) and call them the way callers do, including with payloads
// that crossed google.script.run as JSON. Proves one contract serves the docs, the runtime check
// and the return-value assertions in tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { v_, ValidationError } from '../src/integration/v_.js';
import { parseTaskTitle, formatTaskTitle } from '../src/taskEngine.js';
import { planWaiting } from '../src/integration/taskPlanner.js';

const viaJson = (x) => JSON.parse(JSON.stringify(x));
const isVE = (err) => err instanceof ValidationError;

// ---- harness: the boundary contracts --------------------------------------------------------

const PRIORITY = Object.freeze({ A: 'A', B: 'B', C: 'C' });

const ParsedTitle = v_.shape({
  priorityGroup: v_.string().enumOf(PRIORITY).nullable(),
  sequence: v_.integer().between(1, 9).nullable(),
  priorityCode: v_.string().matches(/^[A-C][1-9]$/).nullable(),
  cleanTitle: v_.string(),
});

const parseTitle = v_.fn('parseTaskTitle')
  .param('rawTitle', 'Raw Google Task title, e.g. "[A1] Buy milk".').string().maxLength(1024).default('')
  .returns(ParsedTitle, 'Priority parts and the clean title.')
  .implement(parseTaskTitle);

const formatTitle = v_.fn('formatTaskTitle')
  .param('priorityGroup', 'A, B or C; null for no priority.').string().trim().enumOf(PRIORITY).nullable()
  .param('sequence', 'Priority sequence 1..9; null for none.').toInteger().between(1, 9).nullable()
  .param('cleanTitle', 'Title text without the priority code.').string().trim().notEmpty()
  .returns(v_.string().minLength(1))
  .implement(formatTaskTitle);

const Thread = v_.shape({
  threadId: v_.string().trim().notEmpty(),
  url: v_.string().matches(/^https:[/][/]mail[.]google[.]com[/]/),
  subject: v_.string().maxLength(998).optional(),
}).loose();

const planWaitingChecked = v_.fn('planWaiting')
  .param('a', 'Waiting request from the client.').shape({
    thread: Thread,
    waitingOn: v_.string().trim().notEmpty().maxLength(200),
    nagDate: v_.string().matches(/^\d{4}-\d{2}-\d{2}$/),
    priority: v_.union(v_.string().matches(/^[A-C][1-9]$/i), v_.shape({ group: v_.string(), sequence: v_.integer() })).optional(),
    existingTasks: v_.arrayOf(v_.shape({ notes: v_.string().optional() }).loose()).maxLength(5000),
    opKey: v_.string().notEmpty(),
    now: v_.toDate(),
  })
  .returns(v_.shape({ action: v_.oneOf('CREATE', 'EXISTS'), task: v_.object() }))
  .implement(planWaiting);

/** A GAS-style RPC handler: one payload object in, a result object out (enforced: trust boundary). */
const saveTaskRpc = v_.fn('saveTaskRpc')
  .param('payload', 'Task edit sent by google.script.run.').shape({
    id: v_.string().matches(/^[\w-]{1,64}$/),
    title: v_.string().trim().length(1, 1024),
    due: v_.toDate().nullable(),
    tags: v_.arrayOf(v_.string().trim().notEmpty()).maxLength(20).default(Object.freeze([])),
  })
  .returns(v_.shape({ ok: v_.boolean(), message: v_.string(), id: v_.string().optional() }))
  .enforceReturns()
  .implement(function saveTaskRpc(payload) {
    return { ok: true, message: `saved ${payload.tags.length} tag(s)`, id: payload.id };
  });

// ---- parseTaskTitle ---------------------------------------------------------------------------

test('E1 parseTaskTitle: same results as the raw function, return contract holds', () => {
  for (const raw of ['[A1] Buy milk', '[c9]  x ', 'plain', '']) {
    const out = parseTitle(raw);
    assert.deepEqual(out, parseTaskTitle(raw));
    assert.equal(v_.checkReturn(parseTitle, out), true);
  }
  assert.deepEqual(parseTitle(), parseTaskTitle(''));
  assert.throws(() => parseTitle(42), (err) => isVE(err) && err.fnName === 'parseTaskTitle' && err.rule === 'type');
  assert.throws(() => parseTitle('x'.repeat(1025)), (err) => isVE(err) && err.rule === 'maxLength');
  assert.throws(() => parseTitle('a', 'b'), (err) => isVE(err) && err.rule === 'arity');
});

test('E2 formatTaskTitle: sanitizes form input before the engine sees it', () => {
  assert.equal(formatTitle(' B ', '3', '  Call Bob '), formatTaskTitle('B', 3, 'Call Bob'));
  assert.equal(formatTitle(null, null, 'No priority'), 'No priority');
  assert.throws(() => formatTitle('D', 1, 'x'), (err) => isVE(err) && err.param === 'priorityGroup' && err.rule === 'enumOf');
  assert.throws(() => formatTitle('A', '10', 'x'), (err) => isVE(err) && err.param === 'sequence' && err.rule === 'between');
  assert.throws(() => formatTitle('A', 1, '   '), (err) => isVE(err) && err.param === 'cleanTitle');
});

// ---- planWaiting with a JSON payload ------------------------------------------------------------

const waitingPayload = () => ({
  thread: { threadId: ' t1 ', url: 'https://mail.google.com/mail/u/0/#inbox/t1', subject: 'Budget', snippet: 'extra' },
  waitingOn: ' Ann ',
  nagDate: '2026-11-02',
  existingTasks: [],
  opKey: 'GMAIL|t1|WAITING',
  now: new Date(Date.UTC(2026, 9, 30, 12)),
});

test('E3 planWaiting: a JSON payload (Date became a string) works only through the boundary', () => {
  const payload = viaJson(waitingPayload());
  assert.throws(() => planWaiting(payload), TypeError); // raw engine: now.toISOString is not a function
  const plan = planWaitingChecked(payload);
  assert.equal(plan.action, 'CREATE');
  assert.match(plan.task.notes, /Created: 2026-10-30T12:00:00.000Z/);
  assert.match(plan.task.notes, /"gmailThreadId":"t1"/);
  assert.equal(v_.checkReturn(planWaitingChecked, plan), true);
  assert.equal(payload.thread.threadId, ' t1 ', 'caller payload is not mutated');
});

test('E4 planWaiting: bad payloads fail at the boundary with a path, never echoing the value', () => {
  const secretish = viaJson(waitingPayload());
  secretish.nagDate = 'ghp_SECRET_2026';
  assert.throws(() => planWaiting(secretish), /SECRET/); // the raw engine echoes it
  assert.throws(() => planWaitingChecked(secretish), (err) => isVE(err) && err.path === 'a.nagDate' && !/SECRET/.test(err.message));
  const noUrl = viaJson(waitingPayload());
  delete noUrl.thread.url;
  assert.throws(() => planWaitingChecked(noUrl), (err) => isVE(err) && err.path === 'a.thread.url' && err.rule === 'required');
  const polluted = JSON.parse(JSON.stringify(waitingPayload()).replace('"thread":{', '"thread":{"__proto__":{"x":1},'));
  assert.throws(() => planWaitingChecked(polluted), (err) => isVE(err) && err.rule === 'unsafeKey');
  const badPriority = { ...waitingPayload(), priority: 'Z9' };
  assert.throws(() => planWaitingChecked(badPriority), (err) => isVE(err) && err.path === 'a.priority');
});

// ---- RPC handler -------------------------------------------------------------------------------

test('E5 RPC handler: JSON payload sanitized, defaults applied, return enforced', () => {
  const res = saveTaskRpc(viaJson({ id: 'task-1', title: '  Write report ', due: '2026-11-01', tags: [' work '] }));
  assert.deepEqual(res, { ok: true, message: 'saved 1 tag(s)', id: 'task-1' });
  assert.deepEqual(saveTaskRpc(viaJson({ id: 'task-2', title: 'x', due: null })).message, 'saved 0 tag(s)');
  assert.throws(() => saveTaskRpc(viaJson({ id: 'task 3', title: 'x', due: null })), (err) => isVE(err) && err.path === 'payload.id');
  assert.throws(() => saveTaskRpc(viaJson({ id: 't', title: 'x', due: null, admin: true })), (err) => isVE(err) && err.rule === 'unknownKey');
  assert.throws(() => saveTaskRpc(viaJson({ id: 't', title: 'x', due: '2026-02-30' })), (err) => isVE(err) && err.path === 'payload.due');
});

test('E6 the boundary contracts print as JSDoc', () => {
  const doc = v_.describe(saveTaskRpc);
  assert.match(doc, /@param \{\{id: string, title: string, due: \?valid Date, tags\?: Array<string>\}\} payload - Task edit sent by google.script.run./);
  assert.match(doc, /@param \{string\} payload\.title - Must have length 1\.\.1024\./);
  assert.match(doc, /@param \{Array<string>\} \[payload\.tags=array\] - Must have length <= 20\./);
  assert.match(doc, /@returns \{\{ok: boolean, message: string, id\?: string\}\}/);
  assert.match(v_.describe(formatTitle), /@param \{\?string\} priorityGroup - A, B or C; null for no priority. Must be one of "A", "B", "C"./);
});
