// Unit tests for src/integration/v_.js: fluent, required-by-default, fail-fast parameter validation
// and sanitizing. Covers every rule boundary, the review findings in docs/v_-review.md, nested-shape
// error paths, and the fn().implement(), compile() and guard().done() paths.
// Coverage gate (100% lines, branches, functions):
//   node --test --experimental-test-coverage --test-coverage-include=src/integration/v_.js tests/v_.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeGasContext, loadEngines } from './helpers/gasRuntimeStubs.js';
import { v_, ValidationError } from '../src/integration/v_.js';
import { EVENT_TYPE, ACTIVE_LABELS } from '../src/integration/contracts.js';

/** Assert fn throws a ValidationError whose fields match `want` (RegExp or exact value). */
function fails(fn, want = {}) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof ValidationError, `expected ValidationError, got ${err && err.name}: ${err && err.message}`);
    for (const [k, v] of Object.entries(want)) {
      if (v instanceof RegExp) assert.match(String(err[k]), v, k);
      else assert.equal(err[k], v, k);
    }
    return true;
  });
}
/** Assert fn throws a definition-time misuse TypeError. */
function misuse(fn, re = /./) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof TypeError, `expected TypeError, got ${err && err.name}: ${err && err.message}`);
    assert.match(err.message, /^v_ misuse: /);
    assert.match(err.message, re);
    return true;
  });
}
/** Run one schema against one value; returns the sanitized value or throws. */
const run = (schema, value) => v_.assertShape(schema, value);
const ok = (schema, value) => assert.doesNotThrow(() => run(schema, value));
const bad = (schema, value, rule) => fails(() => run(schema, value), rule ? { rule } : {});

// ---------------------------------------------------------------------------------------------
// Known bugs from the review (each was red against the draft)
// ---------------------------------------------------------------------------------------------

test('F1 guard chain ends with ParamBuilder.done() (documented example) and returns the args', () => {
  // eslint-disable-next-line no-unused-vars -- named params document the guarded signature
  function transferFunds(fromAccount, toAccount, amount) {
    return v_.guard(arguments, 'transferFunds')
      .param('fromAccount').string().length(5, 20)
      .param('toAccount').string().length(5, 20)
      .param('amount').number().gt(0).lte(10000)
      .done();
  }
  assert.deepEqual(transferFunds('ACC-001', 'ACC-002', 50), ['ACC-001', 'ACC-002', 50]);
  fails(() => transferFunds('ACC-001', 'ACC-002', 0), { fnName: 'transferFunds', param: 'amount', rule: 'gt' });
});

test('F2 compile() validates many calls with one compiled validator', () => {
  const check = v_.fn('hot').param('n').integer().compile();
  assert.equal(typeof check, 'function');
  for (let i = 0; i < 1000; i++) assert.deepEqual(check([i]), [i]);
  fails(() => check(['x']), { fnName: 'hot', rule: 'type' });
});

test('F4 error messages never echo string contents, object dumps or secrets', () => {
  const f = v_.fn('login').param('token').integer().implement((token) => token);
  const secret = 'ghp_SECRET_TOKEN_1234567890';
  assert.throws(() => f(secret), (err) => {
    assert.ok(!err.message.includes('SECRET'), err.message);
    assert.match(err.message, /string \(length 27\)/);
    return true;
  });
  const big = { a: 'x'.repeat(100000) };
  big.self = big;
  assert.throws(() => f(big), (err) => err.message.length < 200 && !err.message.includes('xxx'));
});

test('F5 setting a type twice is a definition-time misuse', () => {
  misuse(() => v_.fn('f').param('a').string().integer(), /type already set to string/);
  misuse(() => v_.string().any(), /type already set/);
});

test('F6 duplicate param names and builder use after implement() are misuse', () => {
  misuse(() => v_.fn('f').param('a').string().param('a'), /duplicate param "a"/);
  const b = v_.fn('f').param('a').string();
  const f = b.implement((a) => a);
  misuse(() => b.optional(), /closed/);
  misuse(() => b.param('b'), /sealed/);
  fails(() => f(undefined), { rule: 'required' });
});

test('F7 nullable null skips type and rules', () => {
  const f = v_.fn('f').param('a').string().minLength(3).nullable().implement((a) => a);
  assert.equal(f(null), null);
  fails(() => f('ab'), { rule: 'minLength' });
  fails(() => v_.fn('g').param('a').string().implement((a) => a)(null), { rule: 'null', path: 'a' });
});

test('F8 numeric rules reject non-numbers and need numeric bounds and types', () => {
  bad(v_.gt(0), '5', 'gt');
  bad(v_.between(1, 9), '5', 'between');
  misuse(() => v_.gt('5'), /finite number/);
  misuse(() => v_.gt(NaN), /finite number/);
  misuse(() => v_.between(9, 1), /min 9 > max 1/);
  misuse(() => v_.fn('f').param('a').string().gt(0).compile(), /gt needs a number or integer type, not string/);
});

test('F9 length counts code points, not UTF-16 units', () => {
  ok(v_.string().length(1), '\u{1F600}');
  ok(v_.string().maxLength(3), '\u{1F600}\u{1F600}\u{1F600}');
  bad(v_.string().maxLength(2), '\u{1F600}\u{1F600}\u{1F600}', 'maxLength');
  ok(v_.string().length(2), 'a\uD800'); // lone high surrogate at the end counts as one
  ok(v_.string().length(3), '\uD800ab'); // high surrogate not followed by a low one
});

test('F10 oneOf reports NaN as NaN and rejects misuse', () => {
  assert.throws(() => run(v_.oneOf(1, 2), NaN), (err) => /number NaN/.test(err.message) && !/null/.test(err.message));
  ok(v_.oneOf(NaN), NaN);
  misuse(() => v_.oneOf(), /at least one value/);
  misuse(() => v_.oneOf(['a', 'b']), /separate arguments/);
});

test('F11 implement() rejects a function with more params than the spec', () => {
  misuse(() => v_.fn('f').param('a').any().implement((a, b) => [a, b]), /declares 2 parameter\(s\) but the spec has 1/);
  misuse(() => v_.fn('f').implement('nope'), /implement\(\) needs a function/);
  const withDefault = v_.fn('f').param('a').string().param('b').string().optional()
    .implement(function f(a, b = 'x') { return a + b; });
  assert.equal(withDefault('a'), 'ax');
});

test('F12 a reusable schema is immutable: deriving does not change the original', () => {
  const ID = v_.string().minLength(1);
  const optionalId = ID.optional();
  ok(optionalId, undefined);
  bad(ID, undefined, 'required');
});

test('F13 matches() with a global regex is not stateful across calls', () => {
  const s = v_.string().matches(/a/g);
  for (let i = 0; i < 4; i++) ok(s, 'a');
  ok(v_.string().matches(/a/y), 'a');
  misuse(() => v_.matches('a'), /RegExp/);
});

test('F14 uuid accepts v1 through v8 and rejects malformed', () => {
  ok(v_.uuid(), '123e4567-e89b-42d3-a456-426614174000');
  ok(v_.uuid(), '01890a5d-ac96-774b-bcce-b302099a8057');
  bad(v_.uuid(), '01890a5d-ac96-974b-bcce-b302099a8057', 'uuid');
  bad(v_.uuid(), 42, 'uuid');
});

test('F15 object() is a plain object only', () => {
  ok(v_.object(), {});
  ok(v_.object(), Object.create(null));
  for (const v of [new Date(), new Map(), [], new (class K {})(), 'x']) bad(v_.object(), v, 'type');
});

test('F16 satisfies predicates must return a boolean', () => {
  const s = v_.satisfies('isEven', (n) => n % 2 === 0);
  ok(s, 2);
  bad(s, 3, 'isEven');
  misuse(() => run(v_.satisfies('truthy', () => 'yes'), 1), /isEven|truthy returned string/);
  misuse(() => v_.satisfies('', () => true), /name/);
  misuse(() => v_.satisfies('x', 'nope'), /function/);
});

test('F17 implement() without a name uses the function name; new works for classes', () => {
  const f = v_.fn().param('a').integer().implement(function addOne(a) { return a + 1; });
  assert.equal(f.name, 'addOne');
  assert.equal(f(1), 2);
  fails(() => f('1'), { fnName: 'addOne' });
  const g = v_.fn().implement(() => 1);
  assert.equal(g.name, 'anonymous');
  class Point { constructor(x) { this.x = x; } }
  const P = v_.fn('Point').param('x').number().implement(Point);
  const p = new P(3);
  assert.ok(p instanceof Point);
  assert.equal(p.x, 3);
  misuse(() => v_.fn(5), /name/);
});

test('F18 forgetting done() on a guard is reported on the next guard() call', () => {
  function sloppy(a) { v_.guard(arguments, 'sloppy').param('a').string(); return a; }
  sloppy('x');
  misuse(() => v_.guard([], 'next'), /guard for sloppy never called done\(\)/);
  assert.deepEqual(v_.guard([], 'next').done(), []); // state was reset by the report
});

// ---------------------------------------------------------------------------------------------
// ValidationError shape
// ---------------------------------------------------------------------------------------------

test('ValidationError has a stable shape', () => {
  const f = v_.fn('createTask').param('opts').shape({ items: v_.arrayOf(v_.shape({ due: v_.string() })) })
    .implement((opts) => opts);
  assert.throws(() => f({ items: [{ due: 'x' }, {}] }), (err) => {
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ValidationError');
    assert.equal(err.fnName, 'createTask');
    assert.equal(err.param, 'opts');
    assert.equal(err.rule, 'required');
    assert.equal(err.path, 'opts.items[1].due');
    assert.equal(err.message, 'createTask(opts.items[1].due): is required but was undefined.');
    return true;
  });
});

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

test('types: any, string, number, integer, boolean, function_, array', () => {
  ok(v_.any(), 0); bad(v_.any(), undefined, 'required');
  ok(v_.string(), ''); bad(v_.string(), 1, 'type');
  ok(v_.number(), -1.5); bad(v_.number(), NaN, 'type'); bad(v_.number(), Infinity, 'type'); bad(v_.number(), '1', 'type');
  ok(v_.integer(), -3); bad(v_.integer(), 1.5, 'type'); bad(v_.integer(), 2 ** 53, 'type');
  ok(v_.boolean(), false); bad(v_.boolean(), 0, 'type');
  ok(v_.function_(), () => 1); bad(v_.function_(), {}, 'type');
  ok(v_.array(), []); bad(v_.array(), {}, 'type');
});

test('types: date is a valid Date only', () => {
  ok(v_.date(), new Date(2026, 9, 30));
  bad(v_.date(), new Date('nope'), 'type');
  bad(v_.date(), '2026-10-30', 'type');
  bad(v_.date(), 0, 'type');
  assert.throws(() => run(v_.date(), new Date('nope')), /received Invalid Date/);
  assert.throws(() => run(v_.string(), new Date(0)), /received Date/);
});

test('types: instanceOf and custom type()', () => {
  ok(v_.instanceOf(Map), new Map());
  bad(v_.instanceOf(Map), {}, 'type');
  assert.throws(() => run(v_.instanceOf(class {}), 1), /expected instance/);
  misuse(() => v_.instanceOf({}), /constructor/);
  const even = v_.type('even', (n) => n % 2 === 0);
  ok(even, 2);
  assert.throws(() => run(even, 3), /expected even, received number 3/);
  misuse(() => run(v_.type('odd', () => 1), 1), /odd returned number/);
  misuse(() => v_.type('', () => true), /name/);
  misuse(() => v_.type('x', 1), /function/);
});

test('types: enumOf a frozen constant object or array', () => {
  const s = v_.string().enumOf(EVENT_TYPE);
  ok(s, 'MEETING');
  assert.throws(() => run(s, 'MEET'), (err) => err.rule === 'enumOf' && /one of "MEETING", "PREP", .* \(and 3 more\)/.test(err.message));
  ok(v_.enumOf(ACTIVE_LABELS), ACTIVE_LABELS[0]);
  misuse(() => v_.enumOf({ A: 'A' }), /frozen/);
  misuse(() => v_.enumOf(Object.freeze({})), /at least one value/);
  misuse(() => v_.enumOf(null), /frozen/);
});

test('types: union / oneOfTypes', () => {
  const u = v_.union(v_.string(), v_.integer());
  ok(u, 'a'); ok(u, 1);
  assert.throws(() => run(u, true), (err) => err.rule === 'type' && /expected string \| integer, received boolean true/.test(err.message));
  const specific = v_.oneOfTypes(v_.string().minLength(3), v_.integer());
  fails(() => run(specific, 'ab'), { rule: 'minLength' });
  misuse(() => v_.union(v_.string()), /at least two/);
  misuse(() => v_.union(v_.string(), 'x'), /schema/);
  ok(v_.union(v_.string().trim(), v_.integer()), ' a ');
  assert.equal(run(v_.union(v_.integer(), v_.string().trim()), ' a '), 'a');
});

// ---------------------------------------------------------------------------------------------
// Rules: boundaries
// ---------------------------------------------------------------------------------------------

test('rules: gt gte lt lte between outside positive nonnegative negative', () => {
  ok(v_.gt(0), 0.1); bad(v_.gt(0), 0, 'gt');
  ok(v_.gte(0), 0); bad(v_.gte(0), -0.1, 'gte');
  ok(v_.lt(10), 9.9); bad(v_.lt(10), 10, 'lt');
  ok(v_.lte(10), 10); bad(v_.lte(10), 10.1, 'lte');
  ok(v_.between(0, 130), 0); ok(v_.between(0, 130), 130); bad(v_.between(0, 130), 131, 'between'); bad(v_.between(0, 130), -1, 'between');
  ok(v_.outside(0, 10), -1); ok(v_.outside(0, 10), 11); bad(v_.outside(0, 10), 0, 'outside'); bad(v_.outside(0, 10), 10, 'outside');
  bad(v_.outside(0, 10), 'x', 'outside');
  misuse(() => v_.outside(10, 0), /min 10 > max 0/);
  ok(v_.positive(), 1); bad(v_.positive(), 0, 'gt');
  ok(v_.nonnegative(), 0); bad(v_.nonnegative(), -1, 'gte');
  ok(v_.negative(), -1); bad(v_.negative(), 0, 'lt');
  ok(v_.integer().between(1, 5), 3);
  ok(v_.union(v_.integer(), v_.string()).gt(0), 1);
});

test('rules: length minLength maxLength empty notEmpty on strings and arrays', () => {
  ok(v_.length(2, 3), 'ab'); ok(v_.length(2, 3), [1, 2, 3]);
  bad(v_.length(2, 3), 'a', 'length'); bad(v_.length(2, 3), [1, 2, 3, 4], 'length');
  bad(v_.length(1), 5, 'length');
  ok(v_.minLength(1), 'a'); bad(v_.minLength(1), '', 'minLength');
  ok(v_.maxLength(1), []); bad(v_.maxLength(1), [1, 2], 'maxLength');
  ok(v_.empty(), ''); bad(v_.empty(), ' ', 'length');
  ok(v_.notEmpty(), [0]); bad(v_.notEmpty(), [], 'minLength');
  misuse(() => v_.length(-1), /non-negative integer/);
  misuse(() => v_.length(1.5), /non-negative integer/);
  misuse(() => v_.length(3, 2), /min 3 > max 2/);
  misuse(() => run(v_.integer().minLength(1), 'x'), /minLength needs a string or array type/);
  misuse(() => v_.fn('f').param('a').integer().minLength(1).compile(), /minLength needs a string or array type, not integer/);
});

test('rules: matches email uuid', () => {
  ok(v_.matches(/^\d+$/), '123'); bad(v_.matches(/^\d+$/), '12a', 'matches'); bad(v_.matches(/x/), 1, 'matches');
  assert.throws(() => run(v_.matches(/^\d+$/), 'a'), /must match \/\^\\d\+\$\//);
  ok(v_.email(), 'a.b@example.co'); ok(v_.email(), 'a@b.c');
  for (const e of ['a@b', '@b.c', 'a@.c', 'a b@c.d', 'a@@b.c', 'a@b.c.', 1]) bad(v_.email(), e, 'email');
  bad(v_.email(), `${'a'.repeat(250)}@b.cd`, 'email');
  misuse(() => run(v_.integer().email(), 1), /email needs a string type/);
});

test('rules: oneOf, enumOf identity and SameValueZero', () => {
  ok(v_.oneOf('admin', 'editor'), 'admin');
  bad(v_.oneOf('admin', 'editor'), 'root', 'oneOf');
  ok(v_.oneOf(0), -0);
  const long = v_.oneOf('a', 'b', 'c', 'd', 'e', 'f', 'g', true, 'x'.repeat(40));
  assert.throws(() => run(long, 'z'), (err) => /\(and 3 more\)/.test(err.message));
  assert.throws(() => run(v_.oneOf(true, -0, 'x'.repeat(40)), 1), /one of true, -0, "x{30}\.\.\."/);
});

// ---------------------------------------------------------------------------------------------
// Presence modifiers
// ---------------------------------------------------------------------------------------------

test('presence: required by default, optional, defined, required, conflicts', () => {
  const f = v_.fn('f').param('a').string().param('b').string().optional().implement((a, b) => [a, b]);
  assert.deepEqual(f('x'), ['x', undefined]);
  fails(() => f(), { rule: 'required', param: 'a', path: 'a' });
  ok(v_.string().required(), 'a');
  ok(v_.string().defined().defined(), 'a');
  misuse(() => v_.string().optional().required(), /already optional/);
  ok(v_.string().optional().optional(), undefined);
  ok(v_.nullable().nullable(), null);
});

// ---------------------------------------------------------------------------------------------
// Sanitizers: trim, default, toNumber, toInteger, toDate
// ---------------------------------------------------------------------------------------------

test('sanitize: trim then rules see the trimmed value; non-strings pass through to the type check', () => {
  assert.equal(run(v_.string().trim().minLength(1), '  a '), 'a');
  bad(v_.string().trim().notEmpty(), '   ', 'minLength');
  bad(v_.string().trim(), 5, 'type');
});

test('sanitize: default applies only when undefined and must satisfy the schema', () => {
  assert.equal(run(v_.string().default('viewer'), undefined), 'viewer');
  bad(v_.string().default('viewer'), null, 'null');
  assert.equal(run(v_.string().default('viewer'), 'admin'), 'admin');
  const frozen = Object.freeze(['a']);
  assert.equal(run(v_.array().default(frozen), undefined), frozen);
  misuse(() => v_.default({}), /primitive or a frozen/);
  misuse(() => v_.default(() => 1), /primitive or a frozen/);
  misuse(() => run(v_.integer().default('x'), 1), /default value fails its own schema: .*expected integer/);
  misuse(() => v_.string().default('a').default('b'), /default already set/);
  ok(v_.integer().default(null).nullable(), undefined);
});

test('sanitize: toNumber and toInteger coerce decimal strings explicitly', () => {
  assert.equal(run(v_.toNumber(), '42'), 42);
  assert.equal(run(v_.toNumber(), '-1.5e3'), -1500);
  assert.equal(run(v_.toNumber(), '.5'), 0.5);
  assert.equal(run(v_.toNumber(), 7), 7);
  assert.equal(run(v_.trim().toNumber(), ' 5 '), 5);
  for (const s of ['', ' 5', '0x10', '1_000', 'abc', '1e', '9'.repeat(70)]) bad(v_.toNumber(), s, 'type');
  assert.throws(() => run(v_.toNumber(), 'abc'), /expected finite number \(after toNumber\), received string \(length 3\)/);
  bad(v_.toNumber(), true, 'type');
  assert.equal(run(v_.toInteger(), '7'), 7);
  bad(v_.toInteger(), '7.5', 'type');
  assert.equal(run(v_.number().toNumber(), '1'), 1);
  assert.equal(run(v_.integer().toNumber(), '1'), 1);
  assert.equal(run(v_.integer().toInteger(), '1'), 1);
  misuse(() => v_.string().toNumber(), /toNumber needs a number or integer type, not string/);
  misuse(() => v_.number().toInteger(), /toInteger needs an integer type, not finite number/);
  misuse(() => v_.toNumber().toNumber(), /coercion already set/);
});

test('sanitize: toDate parses ISO dates as local dates and copies Dates', () => {
  const d = run(v_.toDate(), '2026-10-30');
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 9, 30, 0]);
  const dt = run(v_.toDate(), '2026-10-30T13:45:00Z');
  assert.equal(dt.getTime(), Date.UTC(2026, 9, 30, 13, 45));
  assert.equal(run(v_.toDate(), 0).getTime(), 0);
  const src = new Date(2026, 0, 1);
  const copy = run(v_.toDate(), src);
  assert.notEqual(copy, src);
  assert.equal(copy.getTime(), src.getTime());
  for (const s of ['2026-02-31', '2026-13-01', '10/30/2026', 'nope', NaN, {}, true]) bad(v_.toDate(), s, 'type');
  bad(v_.toDate(), new Date('x'), 'type');
  assert.equal(run(v_.date().toDate(), '2026-01-02').getDate(), 2);
  misuse(() => v_.string().toDate(), /toDate needs a date type, not string/);
});

// ---------------------------------------------------------------------------------------------
// Nested shapes and arrays
// ---------------------------------------------------------------------------------------------

test('shape: strict by default, loose on request, error paths name the key', () => {
  const task = v_.shape({ id: v_.string(), due: v_.string().optional() });
  ok(task, { id: 'a' });
  fails(() => run(task, { id: 'a', extra: 1 }), { rule: 'unknownKey', path: 'value.extra' });
  fails(() => run(task, { due: 'x' }), { rule: 'required', path: 'value.id' });
  fails(() => run(task, []), { rule: 'type' });
  const loose = task.loose();
  assert.deepEqual(run(loose, { id: 'a', extra: 1 }), { id: 'a', extra: 1 });
  misuse(() => v_.string().loose(), /loose\(\) needs a shape/);
  ok(v_.object().shape({}), {});
  misuse(() => v_.shape({}).shape({}), /shape\(\) already set/);
  misuse(() => v_.string().shape({}), /type already set/);
  misuse(() => v_.shape({ a: 'string' }), /schema/);
  misuse(() => v_.shape([]), /plain object/);
  misuse(() => v_.shape({ a: v_.fn('x').param('y') }), /ParamBuilder/);
  misuse(() => v_.shape(JSON.parse('{"__proto__": 1}')), /reserved key "__proto__"/);
  misuse(() => v_.shape({ constructor: v_.any() }), /reserved key "constructor"/);
});

test('shape: inherited keys are not treated as present; absent optional keys stay absent', () => {
  const s = v_.shape({ toString: v_.function_() });
  fails(() => run(s, {}), { rule: 'required', path: 'value.toString' });
  const out = run(v_.shape({ a: v_.string().optional(), b: v_.string().default('z') }), {});
  assert.deepEqual(out, { b: 'z' });
  assert.ok(!('a' in out));
});

test('shape: sanitizes into a new object and never mutates the input', () => {
  const input = { name: '  Ada ', tags: [' x '] };
  const out = run(v_.shape({ name: v_.string().trim(), tags: v_.arrayOf(v_.string().trim()) }), input);
  assert.deepEqual(out, { name: 'Ada', tags: ['x'] });
  assert.deepEqual(input, { name: '  Ada ', tags: [' x '] });
  assert.notEqual(out.tags, input.tags);
});

test('shape: loose copies only enumerable string keys and rejects reserved ones', () => {
  const v = { id: 'a' };
  Object.defineProperty(v, 'hidden', { value: 1, enumerable: false });
  v[Symbol('s')] = 1;
  assert.deepEqual(Reflect.ownKeys(run(v_.shape({ id: v_.string() }).loose(), v)), ['id']);
  fails(() => run(v_.shape({}).loose(), JSON.parse('{"__proto__": {"admin": true}}')), { rule: 'unsafeKey', path: 'value.__proto__' });
  fails(() => run(v_.shape({}), { [Symbol('x')]: 1 }), { rule: 'unknownKey', path: 'value.[symbol]' });
  fails(() => run(v_.shape({}), { 'has space <b>': 1 }), { rule: 'unknownKey', path: 'value.[unnamed key]' });
});

test('arrayOf: elements validated with index paths; legacy signature is misuse', () => {
  const ids = v_.arrayOf(v_.integer());
  assert.deepEqual(run(ids, [1, 2]), [1, 2]);
  fails(() => run(ids, [1, 2, 'x']), { rule: 'type', path: 'value[2]' });
  fails(() => run(v_.arrayOf(v_.shape({ due: v_.string() })), [{ due: 'a' }, { due: 1 }]), { path: 'value[1].due' });
  ok(v_.array().arrayOf(v_.any()), [1]);
  misuse(() => v_.arrayOf(v_.any()).arrayOf(v_.any()), /arrayOf\(\) already set/);
  misuse(() => v_.arrayOf('integer', Number.isInteger), /arrayOf\(\) needs a v_ schema/);
  misuse(() => v_.string().arrayOf(v_.any()), /type already set/);
  bad(v_.arrayOf(v_.any()).maxLength(1), [1, 2], 'maxLength');
  assert.equal(run(v_.arrayOf(v_.any()).satisfies('first is 1', (a) => a[0] === 1), [1])[0], 1);
});

// ---------------------------------------------------------------------------------------------
// fn().implement(), compile(), guard()
// ---------------------------------------------------------------------------------------------

test('implement: passes sanitized args, keeps this, checks arity', () => {
  const seen = [];
  const f = v_.fn('f').param('a').string().trim().param('b').integer().default(1)
    .implement(function (a, b) { seen.push(this, a, b); return 'r'; });
  const self = {};
  assert.equal(f.call(self, ' x '), 'r');
  assert.deepEqual(seen, [self, 'x', 1]);
  fails(() => f('x', 1, 2), { rule: 'arity', param: null, path: '', message: 'f: expected at most 2 argument(s), received 3.' });
  const loose = v_.fn('g').param('a').any().allowExtraArgs().implement((...a) => a);
  assert.deepEqual(loose(1, 2, 3), [1, 2, 3]);
  const strict = v_.fn('h').allowExtraArgs().exactArgs().implement(() => 0);
  fails(() => strict(1), { rule: 'arity' });
  assert.equal(f.length, 2);
});

test('implement: param(name, doc), param(name, schema), param(name, doc, schema)', () => {
  const ID = v_.string().minLength(1);
  const f = v_.fn('f')
    .param('a', 'first')
    .string()
    .param('b', ID)
    .param('c', 'third', ID.optional())
    .implement((a, b, c) => [a, b, c]);
  assert.deepEqual(f('x', 'y'), ['x', 'y', undefined]);
  misuse(() => v_.fn('f').param('a', 'doc', 'notSchema'), /schema/);
  misuse(() => v_.fn('f').param(''), /param name/);
  misuse(() => v_.fn('f').param(1), /param name/);
});

test('compile: returns sanitized copies and never mutates the caller args', () => {
  const check = v_.fn('c').param('a').string().trim().allowExtraArgs().compile();
  const args = [' a ', 9];
  assert.deepEqual(check(args), ['a', 9]);
  assert.deepEqual(args, [' a ', 9]);
  misuse(() => check(null), /array-like/);
  const b = v_.fn('x');
  b.compile();
  misuse(() => b.compile(), /sealed/);
  assert.deepEqual(v_.fn('d').param('a').integer().done([1]), [1]);
});

test('guard: validates in place, fails fast, returns sanitized args, never mutates arguments', () => {
  // eslint-disable-next-line no-unused-vars -- named params document the guarded signature
  function f(a, b) {
    const out = v_.guard(arguments, 'f').param('a').string().trim().param('b').integer().optional().done();
    return { out, a0: arguments[0] };
  }
  assert.deepEqual(f(' x '), { out: ['x', undefined], a0: ' x ' });
  fails(() => f(1, 'boom'), { fnName: 'f', param: 'a' });
  fails(() => f('a', 1, 2), { rule: 'arity' });
  assert.deepEqual(v_.guard(['a', 2]).param('a').any().allowExtraArgs().done(), ['a', 2]);
  fails(() => v_.guard([1]).done(), { fnName: 'anonymous', rule: 'arity' });
  misuse(() => v_.guard(null, 'g'), /array-like/);
  misuse(() => v_.guard([], 'g').done([1]), /guard\(\) already has its arguments/);
  misuse(() => v_.guard([], 'g').implement(() => 1), /guard\(\) validates in place/);
  misuse(() => v_.guard([], 'g').compile(), /guard\(\) validates in place/);
  misuse(() => v_.guard([], 'g').returns(v_.any()), /guard\(\) validates in place/);
  const g = v_.guard([1], 'g');
  const p = g.param('a').integer();
  g.param('b').optional();
  misuse(() => p.string(), /param "a" is closed/);
  g.done();
});

test('returns: documents the contract; not enforced unless enforceReturns()', () => {
  const contract = v_.shape({ ok: v_.boolean() });
  const f = v_.fn('f').param('x').any().returns(contract, 'result flag').implement((x) => x);
  assert.equal(f(5), 5); // documented, not enforced
  assert.equal(v_.checkReturn(f, { ok: true }), true);
  fails(() => v_.checkReturn(f, { ok: 'no' }), { fnName: 'f', param: 'return', path: 'return.ok' });
  const g = v_.fn('g').param('x').any().returns(contract).enforceReturns().implement((x) => x);
  assert.deepEqual(g({ ok: true }), { ok: true });
  fails(() => g(5), { param: 'return', rule: 'type' });
  misuse(() => v_.checkReturn(() => 1, 1), /not built by v_/);
  misuse(() => v_.checkReturn(v_.fn('h').implement(() => 1), 1), /no returns\(\) contract/);
  misuse(() => v_.fn('h').returns('x'), /schema/);
  misuse(() => v_.fn('h').returns(v_.any()).returns(v_.any()), /returns\(\) already set/);
  misuse(() => v_.fn('h').returns(v_.string().trim()), /validate, they do not sanitize/);
  misuse(() => v_.fn('h').returns(v_.shape({ a: v_.arrayOf(v_.union(v_.string(), v_.toNumber())) })), /do not sanitize/);
  misuse(() => v_.fn('h').returns(v_.integer().default(1)), /do not sanitize/);
  misuse(() => v_.fn('h').enforceReturns().implement(() => 1), /enforceReturns\(\) needs returns\(\)/);
  misuse(() => v_.guard([], 'q').enforceReturns(), /guard\(\) validates in place/);
});

test('returns: enforceReturns checks a promise result after it resolves', async () => {
  const f = v_.fn('f').param('x').any().returns(v_.integer()).enforceReturns().implement(async (x) => x);
  assert.equal(await f(1), 1);
  await assert.rejects(f('a'), (err) => err instanceof ValidationError && err.param === 'return');
});

test('assertShape: label defaults to value and misuse on a non-schema', () => {
  fails(() => v_.assertShape(v_.string(), 1, 'payload'), { fnName: 'assertShape', param: 'payload', path: 'payload' });
  fails(() => v_.assertShape(v_.string(), 1), { fnName: 'assertShape', param: 'value', message: 'assertShape(value): expected string, received number 1.' });
  misuse(() => v_.assertShape({}, 1), /schema/);
});

// ---------------------------------------------------------------------------------------------
// Docs: param docs, fn.spec and v_.describe()
// ---------------------------------------------------------------------------------------------

test('describe: prints a JSDoc-equivalent block from the same spec that is enforced', () => {
  const createUser = v_.fn('createUser')
    .param('name', 'Display name.').string().trim().length(1, 80)
    .param('age', 'Age in years.').integer().between(0, 130)
    .param('role').string().oneOf('admin', 'editor', 'viewer').default('viewer')
    .param('opts', 'Options.').shape({
      tags: v_.arrayOf(v_.shape({ id: v_.string().doc('Tag id.') })).optional(),
      due: v_.union(v_.date(), v_.string()).nullable(),
    }).optional()
    .returns(v_.shape({ name: v_.string() }), 'The user.')
    .implement(function createUser(name, age, role = 'viewer') { return { name, age, role }; });
  assert.equal(v_.describe(createUser), [
    '/**',
    ' * createUser',
    ' * @param {string} name - Display name. Must have length 1..80.',
    ' * @param {integer} age - Age in years. Must be between 0 and 130.',
    ' * @param {string} [role="viewer"] - Must be one of "admin", "editor", "viewer".',
    ' * @param {{tags?: Array<{id: string}>, due: ?(valid Date|string)}} [opts] - Options.',
    ' * @param {Array<{id: string}>} [opts.tags]',
    ' * @param {string} opts.tags[].id - Tag id.',
    ' * @param {?(valid Date|string)} opts.due',
    ' * @returns {{name: string}} - The user.',
    ' */',
  ].join('\n'));
  assert.equal(createUser.spec.name, 'createUser');
  assert.deepEqual(createUser.spec.params.map((p) => p.name), ['name', 'age', 'role', 'opts']);
  assert.equal(createUser.spec.params[2].defaultValue, 'viewer');
  assert.ok(Object.isFrozen(createUser.spec));
  const check = v_.fn('c').param('n').toNumber().compile();
  assert.equal(v_.describe(check), '/**\n * c\n * @param {finite number} n\n */');
  assert.equal(v_.describe(v_.fn('e').param('x').default(0).returns(v_.any()).compile()),
    '/**\n * e\n * @param {any} [x=0]\n * @returns {any}\n */');
  assert.match(v_.describe(v_.fn('t').param('x').default(true).compile()), /\[x=true\]/);
  assert.match(v_.describe(v_.fn('t').param('x').array().default(Object.freeze([])).compile()), /\[x=array\]/);
  misuse(() => v_.describe(() => 1), /not built by v_/);
  misuse(() => v_.string().doc(5), /doc/);
});

// ---------------------------------------------------------------------------------------------
// Remaining edges: cross-realm values, unreadable input, unnamed builders, describe() corners
// ---------------------------------------------------------------------------------------------

test('edges: cross-realm Dates are Dates; a spoofed Date tag is unreadable and logged', (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const foreign = vm.runInNewContext('new Date(0)');
  assert.equal(run(v_.date(), foreign), foreign);
  assert.throws(() => run(v_.string(), foreign), /received Date/);
  fails(() => run(v_.date(), { [Symbol.toStringTag]: 'Date' }), { rule: 'unreadable' });
  assert.equal(logged.mock.callCount(), 1);
  assert.match(String(logged.mock.calls[0].arguments[0]), /assertShape\(value\) threw while reading/);
  assert.match(String(logged.mock.calls[0].arguments[1]), /TypeError/);
});

test('edges: non-Error throws are logged raw; ValidationErrors from predicates propagate', (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  fails(() => run(v_.satisfies('odd', () => { throw 'plain string'; }), 1), { rule: 'unreadable' });
  assert.equal(logged.mock.calls[0].arguments[1], 'plain string');
  const inner = v_.fn('inner').param('n').integer().implement((n) => n);
  fails(() => run(v_.satisfies('callsInner', (v) => inner(v) === 1), 'x'), { fnName: 'inner' });
});

test('edges: describe() of values that never echo', () => {
  assert.throws(() => run(v_.string(), () => 1), /received function\./);
  assert.throws(() => run(v_.string(), 1n), /received bigint\./);
  misuse(() => v_.assertShape(null, 1), /got null/);
  assert.match(v_.describe(v_.fn('o').param('x').object().default(Object.freeze({})).compile()), /\[x=object\]/);
  assert.match(v_.describe(v_.fn('n').param('x').nullable().default(null).compile()), /\{\?any\} \[x=null\]/);
});

test('edges: unnamed builders, empty specs, ParamBuilder.exactArgs, describe misuse', () => {
  const check = v_.fn().param('a').any().allowExtraArgs().exactArgs().compile();
  fails(() => check([1, 2]), { fnName: 'anonymous', rule: 'arity' });
  const b = v_.fn();
  b.compile();
  misuse(() => b.param('x'), /fn builder is sealed/);
  misuse(() => v_.fn('f').implement((a) => a), /declares 1 parameter\(s\) but the spec has 0/);
  misuse(() => v_.describe({}), /not built by v_/);
  v_.guard([1]).param('a').any();
  misuse(() => v_.guard([]), /guard for anonymous never called done\(\)/);
});

// ---------------------------------------------------------------------------------------------
// Runtimes: GAS (vm-loaded Engines.gs) and a Script.html paste
// ---------------------------------------------------------------------------------------------

test('runtime: DPEngines.v_ in the GAS vm realm validates and throws its ValidationError', () => {
  const engines = loadEngines(makeGasContext());
  const f = engines.v_.fn('gasFn').param('n').toInteger().between(1, 9).implement((n) => n * 2);
  assert.equal(f('4'), 8);
  assert.throws(() => f('10'), (err) => err instanceof engines.ValidationError && err.rule === 'between' && err.path === 'n');
});

test('runtime: the source is safe to paste into gas-app/Script.html (HtmlService byte rules)', () => {
  const src = fs.readFileSync(new URL('../src/integration/v_.js', import.meta.url), 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v_-safe-'));
  const file = path.join(dir, 'Script.html');
  fs.writeFileSync(file, `<script>\n${src}</script>\n`);
  const res = spawnSync(process.execPath, [fileURLToPath(new URL('../tools/check-gas-script-html-safe-chars.js', import.meta.url)), file], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(res.status, 0, res.stderr);
});
