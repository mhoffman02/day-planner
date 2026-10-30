// Adversarial security and sanitizer suite for src/integration/v_.js. Hostile callers hand the boundary
// prototype-polluting JSON, accessors that throw or change between reads, Proxies, lying valueOf and
// toString, huge strings, deep nesting, ReDoS bait, odd numbers, boxed primitives, cross-realm values,
// sparse arrays and Symbol keys. The validator must stay bounded, fail closed and never echo the value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fc from 'fast-check';
import { v_, ValidationError } from '../src/integration/v_.js';

const isVE = (err) => err instanceof ValidationError;
/** Wrap a one-param function the way an exported boundary would be. */
const boundary = (build) => build(v_.fn('boundary').param('x')).implement((x) => x);
const timed = (fn) => { const t0 = process.hrtime.bigint(); let err = null; try { fn(); } catch (e) { err = e; } return { ms: Number(process.hrtime.bigint() - t0) / 1e6, err }; };
const HTML_TAG = /<[A-Za-z!/?]/;

// ---- prototype pollution -----------------------------------------------------------------------

test('A1 __proto__ in a JSON payload is rejected and never pollutes Object.prototype', () => {
  const payload = JSON.parse('{"id":"a","__proto__":{"polluted":true}}');
  for (const s of [v_.shape({ id: v_.string() }), v_.shape({ id: v_.string() }).loose()]) {
    assert.throws(() => v_.assertShape(s, payload), (err) => isVE(err) && err.rule === 'unsafeKey' && err.path === 'value.__proto__');
  }
  assert.equal({}.polluted, undefined);
});

test('A2 constructor and prototype keys are rejected in loose shapes; spec cannot declare them', () => {
  const s = v_.shape({}).loose();
  for (const key of ['constructor', 'prototype']) {
    const payload = JSON.parse(`{"${key}":{"admin":true}}`);
    assert.throws(() => v_.assertShape(s, payload), (err) => isVE(err) && err.rule === 'unsafeKey');
  }
  assert.throws(() => v_.shape({ prototype: v_.any() }), /reserved key/);
});

test('A3 sanitized shape output is a fresh plain object with the normal prototype', () => {
  const out = v_.assertShape(v_.shape({ a: v_.string() }).loose(), Object.assign(Object.create(null), { a: 'x', b: 1 }));
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
  assert.deepEqual(out, { a: 'x', b: 1 });
});

// ---- accessors, TOCTOU, Proxies -----------------------------------------------------------------

test('A4 a getter that throws is rejected as unreadable and logged with its stack', (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const hostile = { get id() { throw new Error('getter boom'); } };
  assert.throws(() => v_.assertShape(v_.shape({ id: v_.string() }), hostile),
    (err) => isVE(err) && err.rule === 'unreadable' && !/boom/.test(err.message));
  assert.equal(logged.mock.callCount(), 1);
  assert.match(String(logged.mock.calls[0].arguments[1]), /getter boom/);
});

test('A5 TOCTOU: a getter is read once and the function receives the checked copy', () => {
  let reads = 0;
  const shifty = { get id() { reads += 1; return reads === 1 ? 'ok' : 12345; } };
  const f = v_.fn('f').param('o').shape({ id: v_.string() }).implement((o) => [o.id, o.id, o === shifty]);
  assert.deepEqual(f(shifty), ['ok', 'ok', false]);
  assert.equal(reads, 1);
});

test('A6 Proxy payloads are copied out; throwing and revoked Proxies fail closed', (t) => {
  t.mock.method(console, 'error', () => {});
  const seen = [];
  const proxy = new Proxy({ id: 'a' }, { get(target, k) { seen.push(k); return target[k]; } });
  const out = v_.assertShape(v_.shape({ id: v_.string() }), proxy);
  assert.notEqual(out, proxy);
  assert.deepEqual(out, { id: 'a' });
  const throwing = new Proxy({}, { ownKeys() { throw new Error('trap'); } });
  assert.throws(() => v_.assertShape(v_.shape({}), throwing), (err) => isVE(err) && err.rule === 'unreadable');
  const { proxy: revoked, revoke } = Proxy.revocable({}, {});
  revoke();
  for (const s of [v_.object(), v_.array(), v_.date(), v_.shape({})]) {
    assert.throws(() => v_.assertShape(s, revoked), (err) => isVE(err) && err.rule === 'unreadable');
  }
});

// ---- lying or throwing toString / valueOf / toJSON / toStringTag -------------------------------

test('A7 objects whose toString, valueOf or toJSON throw still produce a ValidationError', () => {
  const evil = { toString() { throw new Error('ts'); }, valueOf() { throw new Error('vo'); }, toJSON() { throw new Error('tj'); } };
  const f = boundary((p) => p.string());
  assert.throws(() => f(evil), (err) => isVE(err) && err.rule === 'type');
});

test('A8 a valueOf that lies is never used for numeric rules', () => {
  const liar = { valueOf() { return 5; } };
  assert.throws(() => boundary((p) => p.gt(0))(liar), (err) => isVE(err) && err.rule === 'gt');
  assert.throws(() => boundary((p) => p.number())(liar), isVE);
});

test('A9 a spoofed Symbol.toStringTag Date is not accepted as a Date', (t) => {
  t.mock.method(console, 'error', () => {});
  const fake = { [Symbol.toStringTag]: 'Date', getTime() { return 0; } };
  assert.throws(() => v_.assertShape(v_.date(), fake), isVE);
  assert.throws(() => v_.assertShape(v_.toDate(), fake), isVE);
});

// ---- size, depth and ReDoS bounds --------------------------------------------------------------

test('A10 a 1e6-char string is checked quickly and the message stays short', () => {
  const huge = 'x'.repeat(1e6);
  for (const f of [boundary((p) => p.integer()), boundary((p) => p.string().maxLength(10)), boundary((p) => p.string().oneOf('a'))]) {
    const { ms, err } = timed(() => f(huge));
    assert.ok(isVE(err), String(err));
    assert.ok(err.message.length < 200, `message length ${err.message.length}`);
    assert.ok(ms < 500, `${ms} ms`);
  }
});

test('A11 deep nesting is never traversed past the schema depth', () => {
  let deep = {};
  for (let i = 0; i < 1e5; i++) deep = { child: deep };
  const { ms, err } = timed(() => v_.assertShape(v_.shape({ child: v_.shape({}) }), deep));
  assert.ok(isVE(err) && err.rule === 'unknownKey' && err.path === 'value.child.child', String(err));
  assert.ok(ms < 100, `${ms} ms`);
  assert.equal(v_.assertShape(v_.object(), deep), deep);
});

test('A12 email() and uuid() are ReDoS-safe under pathological input', () => {
  const email = boundary((p) => p.email());
  const uuid = boundary((p) => p.uuid());
  const bait = [
    `a@${'a.'.repeat(20000)}@`,
    `${'a'.repeat(1e5)}@`,
    `a@${'a'.repeat(1e5)}`,
    `${'0'.repeat(1e5)}-`,
  ];
  for (const input of bait) {
    for (const f of [email, uuid]) {
      const { ms, err } = timed(() => f(input));
      assert.ok(isVE(err), String(err));
      assert.ok(ms < 100, `${ms} ms on input length ${input.length}`);
    }
  }
});

test('A13 toNumber and toDate coercion regexes are linear on huge input', () => {
  for (const s of [v_.toNumber(), v_.toDate()]) {
    const { ms, err } = timed(() => v_.assertShape(s, `${'1'.repeat(1e6)}x`));
    assert.ok(isVE(err));
    assert.ok(ms < 100, `${ms} ms`);
  }
});

// ---- numbers, boxed primitives, cross-realm values ---------------------------------------------

test('A14 NaN, Infinity and -0', () => {
  for (const v of [NaN, Infinity, -Infinity]) assert.throws(() => boundary((p) => p.number())(v), isVE);
  assert.throws(() => boundary((p) => p.integer())(NaN), (err) => /number NaN/.test(err.message));
  assert.ok(Object.is(boundary((p) => p.integer())(-0), -0));
  assert.throws(() => boundary((p) => p.positive())(-0), (err) => /number -0/.test(err.message));
  assert.ok(Object.is(v_.assertShape(v_.toNumber(), '-0'), -0));
});

test('A15 boxed primitives are not primitives and not plain objects', () => {
  assert.throws(() => boundary((p) => p.string())(new String('x')), isVE);
  assert.throws(() => boundary((p) => p.number())(new Number(1)), isVE);
  assert.throws(() => boundary((p) => p.boolean())(new Boolean(false)), isVE);
  assert.throws(() => boundary((p) => p.object())(new String('x')), isVE);
});

test('A16 cross-realm arrays, plain objects and Dates validate like local ones', () => {
  const ctx = vm.createContext({});
  assert.deepEqual(v_.assertShape(v_.arrayOf(v_.integer()), vm.runInContext('[1, 2, 3]', ctx)), [1, 2, 3]);
  assert.deepEqual(v_.assertShape(v_.shape({ a: v_.integer() }), vm.runInContext('({ a: 1 })', ctx)), { a: 1 });
  const d = vm.runInContext('new Date(0)', ctx);
  assert.equal(v_.assertShape(v_.date(), d), d);
  assert.equal(v_.assertShape(v_.toDate(), d).getTime(), 0);
  assert.throws(() => v_.assertShape(v_.date(), vm.runInContext('new Date(NaN)', ctx)), isVE);
});

// ---- sparse arrays and Symbol keys -------------------------------------------------------------

test('A17 sparse arrays: holes are missing values, output has no holes', () => {
  // eslint-disable-next-line no-sparse-arrays
  const sparse = [1, , 3];
  assert.throws(() => v_.assertShape(v_.arrayOf(v_.integer()), sparse), (err) => isVE(err) && err.path === 'value[1]' && err.rule === 'required');
  const out = v_.assertShape(v_.arrayOf(v_.integer().optional()), sparse);
  assert.ok(1 in out);
  assert.deepEqual(out, [1, undefined, 3]);
});

test('A18 Symbol keys are rejected by strict shapes and dropped by loose shapes', () => {
  const sym = Symbol('ghp_SECRET');
  const v = { a: 1, [sym]: 2 };
  assert.throws(() => v_.assertShape(v_.shape({ a: v_.integer() }), v), (err) => isVE(err) && err.rule === 'unknownKey' && !/SECRET/.test(err.message));
  assert.deepEqual(Object.getOwnPropertySymbols(v_.assertShape(v_.shape({ a: v_.integer() }).loose(), v)), []);
});

// ---- secrets and HTML in messages --------------------------------------------------------------

test('A19 token-like values and keys never appear in error messages', () => {
  const token = ['sk', 'live', '51H8xSECRETabcdefghijklmnop'].join('_'); // built at runtime: push protection scans literals
  const cases = [
    () => boundary((p) => p.integer())(token),
    () => boundary((p) => p.string().minLength(100))(token),
    () => boundary((p) => p.string().oneOf('a', 'b'))(token),
    () => boundary((p) => p.string().matches(/^x$/))(token),
    () => boundary((p) => p.email())(token),
    () => boundary((p) => p.satisfies('short', (s) => s.length < 3))(token),
    () => v_.assertShape(v_.shape({}), { [token]: 1 }),
  ];
  for (const c of cases) {
    assert.throws(c, (err) => isVE(err) && !err.message.includes('SECRET') && !err.path.includes('SECRET'));
  }
});

test('A20 error messages are safe to render as HTML', () => {
  const xss = '<script>alert(1)</script>';
  const cases = [
    () => boundary((p) => p.integer())(xss),
    () => boundary((p) => p.string().maxLength(3))(xss),
    () => v_.assertShape(v_.shape({}), { '<img src=x onerror=alert(1)>': 1 }),
    () => v_.assertShape(v_.arrayOf(v_.integer()), ['<b>']),
  ];
  for (const c of cases) assert.throws(c, (err) => isVE(err) && !HTML_TAG.test(err.message));
});

// ---- sanitizer idempotence ---------------------------------------------------------------------

test('A21 sanitize(sanitize(x)) equals sanitize(x) for every sanitizer (property)', () => {
  const schemas = [
    v_.string().trim(),
    v_.trim().toNumber(),
    v_.toInteger(),
    v_.toDate(),
    v_.string().trim().default('d'),
    v_.arrayOf(v_.string().trim()),
    v_.shape({ name: v_.string().trim(), n: v_.trim().toNumber().optional(), tag: v_.string().default('x') }).loose(),
  ];
  const input = fc.oneof(
    fc.string(), fc.integer(), fc.double(), fc.constant(undefined), fc.date(),
    fc.array(fc.string()), fc.stringMatching(/^ ?-?\d{1,4}(\.\d{1,3})? ?$/),
    fc.record({ name: fc.string(), n: fc.oneof(fc.string(), fc.integer()) }, { requiredKeys: ['name'] }),
  );
  fc.assert(fc.property(fc.integer({ min: 0, max: schemas.length - 1 }), input, (i, x) => {
    let once;
    try { once = v_.assertShape(schemas[i], x); } catch (err) {
      if (err instanceof ValidationError) return true; // rejected input: nothing to re-sanitize
      throw err;
    }
    assert.deepEqual(v_.assertShape(schemas[i], once), once);
    return true;
  }), { numRuns: 500 });
});
