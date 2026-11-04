/**
 * @file v_.js
 * @description Fluent, required-by-default, fail-fast parameter validation AND sanitizing for module
 * boundaries (exported functions, RPC handlers). An enforced replacement for JSDoc @param comments:
 * the same chain documents the contract (v_.describe prints a JSDoc block), checks it at run time,
 * and lets tests assert return values against it (v_.checkReturn).
 *
 *   const createUser = v_.fn("createUser")
 *     .param("name", "Display name.").string().trim().length(1, 80)
 *     .param("age", "Age in years.").integer().between(0, 130)
 *     .param("role").string().oneOf("admin", "editor", "viewer").default("viewer")
 *     .returns(v_.shape({ name: v_.string() }), "The new user.")
 *     .implement(function createUser(name, age, role) { return { name, age, role }; });
 *
 *   function transferFunds(from, to, amount) {
 *     const args = v_.guard(arguments, "transferFunds")
 *       .param("from").string().length(5, 20)
 *       .param("amount").toNumber().gt(0)
 *       .done();   (returns the sanitized args; arguments itself is never changed)
 *   }
 *
 * Rules: every param is required unless optional(), default() or nullable() says otherwise. Builder
 * misuse throws a TypeError ("v_ misuse: ...") at definition time; bad caller input throws a
 * ValidationError {name, message, fnName, param, rule, path}. Messages never contain string
 * contents, object dumps or stack text, so they are safe to show users and to render as HTML.
 * Sanitizers run before the checks in a fixed order: default, trim, coercion. No implicit coercion.
 * Pure, dependency-free; runs in node, the browser and GAS V8 (bundled into gas-app/Engines.gs).
 * Source rules for a later paste into gas-app/Script.html: no double slash inside string or regex
 * literals, no apostrophe or backtick in comments, no HTML comment markers anywhere.
 */
export const v_ = (function () {

  const hasOwn = Object.prototype.hasOwnProperty;
  const objToString = Object.prototype.toString;
  const dateGetTime = Date.prototype.getTime;
  const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype'];
  const SAFE_KEY_RE = /^[A-Za-z_$][\w$-]{0,23}$/;
  const DECIMAL_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/;
  const EMAIL_RE = /^[^\s@.]+(?:\.[^\s@.]+)*@[^\s@.]+(?:\.[^\s@.]+)+$/;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const MAX_COERCE_LENGTH = 64;
  const MAX_EMAIL_LENGTH = 254;
  const MAX_LISTED = 6;
  const KNOWN_KINDS = ['string', 'number', 'integer', 'boolean', 'function', 'array', 'object', 'date', 'instance'];
  const NEEDS = {
    number: { kinds: ['number', 'integer'], text: 'a number or integer type' },
    length: { kinds: ['string', 'array'], text: 'a string or array type' },
    string: { kinds: ['string'], text: 'a string type' }
  };

  /** Caller input failed its contract. Safe to show: the message never echoes the value. */
  class ValidationError extends Error {
    constructor(message, info) {
      super(message);
      this.name = 'ValidationError';
      this.fnName = info.fnName;
      this.param = info.param;
      this.rule = info.rule;
      this.path = info.path;
    }
  }

  /** Programmer error in a v_ chain. Thrown at definition time where possible. */
  class MisuseError extends TypeError {}

  /** A failed check on the way up from a nested value; becomes a ValidationError at the boundary. */
  class Issue {
    constructor(rule, detail) {
      this.rule = rule;
      this.detail = detail;
      this.path = [];
    }
  }

  let openGuard = null;

  function misuse(message) {
    openGuard = null;
    throw new MisuseError('v_ misuse: ' + message);
  }

  // ---- describing values without echoing them -------------------------------------------------

  function numText(n) {
    return Object.is(n, -0) ? '-0' : String(n);
  }

  /** Date time value, NaN for an Invalid Date, undefined when v is not a Date (any realm). */
  function dateTime(v) {
    if (v instanceof Date) return dateGetTime.call(v);
    if (objToString.call(v) !== '[object Date]') return undefined;
    return dateGetTime.call(v); // a spoofed toStringTag throws here; the boundary reports it as unreadable
  }

  function isPlain(v) {
    if (v === null || typeof v !== 'object') return false;
    const p = Object.getPrototypeOf(v);
    return p === null || Object.getPrototypeOf(p) === null;
  }

  function describe(v) {
    const t = typeof v;
    if (v === null) return 'null';
    if (t === 'number') return 'number ' + numText(v);
    if (t === 'boolean') return 'boolean ' + v;
    if (t === 'string') return 'string (length ' + v.length + ')';
    if (t !== 'object') return t;
    if (Array.isArray(v)) return 'array (length ' + v.length + ')';
    const time = dateTime(v);
    if (time !== undefined) return time === time ? 'Date' : 'Invalid Date';
    return isPlain(v) ? 'object' : 'non-plain object';
  }

  function clip(s, n) {
    return s.length <= n ? s : s.slice(0, n) + '...';
  }

  /** Developer-defined constants (oneOf, enumOf, default) rendered for messages and docs. */
  function renderValue(x) {
    if (typeof x === 'string') return '"' + clip(x, 30) + '"';
    if (typeof x === 'number') return numText(x);
    if (typeof x === 'boolean' || x === null) return String(x);
    return Array.isArray(x) ? 'array' : typeof x;
  }

  function listValues(values) {
    const shown = values.slice(0, MAX_LISTED).map(renderValue).join(', ');
    return values.length > MAX_LISTED ? shown + ' (and ' + (values.length - MAX_LISTED) + ' more)' : shown;
  }

  /** Caller-supplied key names are shown only when short and identifier-like (no secrets, no HTML). */
  function keyLabel(k) {
    if (typeof k === 'symbol') return '[symbol]';
    return SAFE_KEY_RE.test(k) ? k : '[unnamed key]';
  }

  function formatPath(segments) {
    let out = '';
    for (const s of segments) out += typeof s === 'number' ? '[' + s + ']' : (out === '' ? s : '.' + s);
    return out;
  }

  // ---- definition records -----------------------------------------------------------------------

  function newDef() {
    return {
      typeKind: null, typeName: 'any', typeCheck: null, presence: null, nullable: false, rules: [],
      shape: null, loose: false, element: null, members: null, trim: false, coerce: null,
      hasDefault: false, defaultValue: undefined, doc: ''
    };
  }

  function cloneDef(d) {
    const c = Object.assign({}, d);
    c.rules = d.rules.slice();
    return c;
  }

  /** Immutable, reusable schema: every chain method returns a new Schema. */
  class Schema {
    constructor(def) {
      this._def = def;
      this._check = null;
    }
  }

  function checkerOf(schema) {
    if (schema._check === null) schema._check = compileDef(schema._def);
    return schema._check;
  }

  function requireSchema(x, who) {
    if (x instanceof ParamBuilder) misuse(who + ' got a ParamBuilder; pass a standalone schema such as v_.string().');
    if (!(x instanceof Schema)) misuse(who + ' needs a v_ schema such as v_.string(), got ' + describe(x) + '.');
  }

  function strictBool(result, name) {
    if (typeof result !== 'boolean') misuse(name + ' returned ' + typeof result + '; predicates must return a boolean.');
    return result;
  }

  function setType(d, kind, name, check) {
    if (d.typeKind !== null) misuse('type already set to ' + d.typeName + '; cannot also be ' + name + '.');
    d.typeKind = kind;
    d.typeName = name;
    d.typeCheck = check;
  }

  function setPresence(d, presence) {
    if (d.presence !== null && d.presence !== presence) misuse('param is already ' + d.presence + '; cannot also be ' + presence + '.');
    d.presence = presence;
  }

  function addRule(d, id, label, needs, test) {
    d.rules.push({ id: id, label: label, needs: needs, test: test });
  }

  function finiteBound(x, who) {
    if (typeof x !== 'number' || !Number.isFinite(x)) misuse(who + ' bound must be a finite number, got ' + describe(x) + '.');
  }

  function orderedBounds(min, max, who) {
    if (min > max) misuse(who + ' has min ' + min + ' > max ' + max + '.');
  }

  function lengthBound(x, who) {
    if (!Number.isSafeInteger(x) || x < 0) misuse(who + ' bound must be a non-negative integer, got ' + describe(x) + '.');
  }

  function numRule(d, id, label, test) {
    addRule(d, id, 'be ' + label, 'number', (v) => typeof v === 'number' && test(v));
  }

  /** Code points, so an emoji counts once (UTF-16 surrogate pairs are one character). */
  function codePoints(s) {
    let n = s.length;
    for (let i = 0; i < s.length - 1; i++) {
      const c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const c2 = s.charCodeAt(i + 1);
        if (c2 >= 0xdc00 && c2 <= 0xdfff) { n--; i++; }
      }
    }
    return n;
  }

  function sizeOf(v) {
    if (typeof v === 'string') return codePoints(v);
    return Array.isArray(v) ? v.length : -1;
  }

  function lengthRule(d, id, min, max, label) {
    addRule(d, id, 'have length ' + label, 'length', (v) => {
      const n = sizeOf(v);
      return n >= min && n <= max;
    });
  }

  function setCoerce(d, kind, okKinds, typeKind, typeName, check, who, needText) {
    if (d.coerce !== null) misuse('coercion already set to ' + d.coerce + '.');
    if (d.typeKind === null) setType(d, typeKind, typeName, check);
    else if (okKinds.indexOf(d.typeKind) === -1) misuse(who + ' needs ' + needText + ', not ' + d.typeName + '.');
    d.coerce = kind;
  }

  const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
  const isInteger = (v) => Number.isSafeInteger(v);
  const isValidDate = (v) => {
    if (v === null || typeof v !== 'object') return false;
    const t = dateTime(v);
    return t !== undefined && t === t;
  };

  /** Every chain method, as (def, ...args) mutators. Schema copies the def first; ParamBuilder does not. */
  const METHODS = {
    any(d) { setType(d, 'any', 'any', null); },
    string(d) { setType(d, 'string', 'string', (v) => typeof v === 'string'); },
    number(d) { setType(d, 'number', 'finite number', isNumber); },
    integer(d) { setType(d, 'integer', 'integer', isInteger); },
    boolean(d) { setType(d, 'boolean', 'boolean', (v) => typeof v === 'boolean'); },
    function_(d) { setType(d, 'function', 'function', (v) => typeof v === 'function'); },
    array(d) { setType(d, 'array', 'array', Array.isArray); },
    object(d) { setType(d, 'object', 'object', isPlain); },
    date(d) { setType(d, 'date', 'valid Date', isValidDate); },
    instanceOf(d, ctor) {
      if (typeof ctor !== 'function') misuse('instanceOf() needs a constructor function.');
      setType(d, 'instance', ctor.name || 'instance', (v) => v instanceof ctor);
    },
    type(d, name, check) {
      if (typeof name !== 'string' || name === '') misuse('type() needs a non-empty name.');
      if (typeof check !== 'function') misuse('type(' + name + ') needs a check function.');
      setType(d, 'custom', name, (v) => strictBool(check(v), name));
    },
    shape(d, spec) {
      if (!isPlain(spec)) misuse('shape() needs a plain object of schemas.');
      const frozen = Object.create(null);
      for (const k of Object.keys(spec)) {
        if (UNSAFE_KEYS.indexOf(k) !== -1) misuse('shape() has a reserved key "' + k + '".');
        requireSchema(spec[k], 'shape() key "' + k + '"');
        frozen[k] = spec[k];
      }
      if (d.typeKind !== 'object') setType(d, 'object', 'object', isPlain);
      else if (d.shape !== null) misuse('shape() already set.');
      d.shape = Object.freeze(frozen);
    },
    loose(d) {
      if (d.shape === null) misuse('loose() needs a shape().');
      d.loose = true;
    },
    arrayOf(d, element) {
      if (typeof element === 'string') misuse('arrayOf() needs a v_ schema, e.g. arrayOf(v_.integer()), not a (name, fn) pair.');
      requireSchema(element, 'arrayOf()');
      if (d.typeKind !== 'array') setType(d, 'array', 'array', Array.isArray);
      else if (d.element !== null) misuse('arrayOf() already set.');
      d.element = element;
    },
    union(d, ...members) {
      if (members.length < 2) misuse('union() needs at least two schemas.');
      members.forEach((m) => requireSchema(m, 'union()'));
      setType(d, 'union', members.map((m) => m._def.typeName).join(' | '), null);
      d.members = members;
    },
    oneOf(d, ...values) {
      if (values.length === 0) misuse('oneOf() needs at least one value.');
      if (values.length === 1 && Array.isArray(values[0])) misuse('oneOf() takes values as separate arguments, not an array.');
      addRule(d, 'oneOf', 'be one of ' + listValues(values), null, (v) => values.includes(v));
    },
    enumOf(d, constants) {
      if (constants === null || typeof constants !== 'object' || !Object.isFrozen(constants)) {
        misuse('enumOf() needs a frozen constant object or array (Object.freeze it).');
      }
      const values = Object.values(constants);
      if (values.length === 0) misuse('enumOf() needs at least one value.');
      addRule(d, 'enumOf', 'be one of ' + listValues(values), null, (v) => values.includes(v));
    },
    satisfies(d, name, check) {
      if (typeof name !== 'string' || name === '') misuse('satisfies() needs a non-empty name.');
      if (typeof check !== 'function') misuse('satisfies(' + name + ') needs a check function.');
      addRule(d, name, 'satisfy ' + name, null, (v) => strictBool(check(v), name));
    },
    gt(d, min) { finiteBound(min, 'gt()'); numRule(d, 'gt', '> ' + min, (v) => v > min); },
    gte(d, min) { finiteBound(min, 'gte()'); numRule(d, 'gte', '>= ' + min, (v) => v >= min); },
    lt(d, max) { finiteBound(max, 'lt()'); numRule(d, 'lt', '< ' + max, (v) => v < max); },
    lte(d, max) { finiteBound(max, 'lte()'); numRule(d, 'lte', '<= ' + max, (v) => v <= max); },
    between(d, min, max) {
      finiteBound(min, 'between()'); finiteBound(max, 'between()'); orderedBounds(min, max, 'between()');
      numRule(d, 'between', 'between ' + min + ' and ' + max, (v) => v >= min && v <= max);
    },
    outside(d, min, max) {
      finiteBound(min, 'outside()'); finiteBound(max, 'outside()'); orderedBounds(min, max, 'outside()');
      numRule(d, 'outside', 'outside ' + min + ' and ' + max, (v) => v < min || v > max);
    },
    positive(d) { METHODS.gt(d, 0); },
    nonnegative(d) { METHODS.gte(d, 0); },
    negative(d) { METHODS.lt(d, 0); },
    length(d, min, max = min) {
      lengthBound(min, 'length()'); lengthBound(max, 'length()'); orderedBounds(min, max, 'length()');
      lengthRule(d, 'length', min, max, min === max ? String(min) : min + '..' + max);
    },
    minLength(d, min) { lengthBound(min, 'minLength()'); lengthRule(d, 'minLength', min, Infinity, '>= ' + min); },
    maxLength(d, max) { lengthBound(max, 'maxLength()'); lengthRule(d, 'maxLength', 0, max, '<= ' + max); },
    empty(d) { METHODS.length(d, 0); },
    notEmpty(d) { METHODS.minLength(d, 1); },
    matches(d, re) {
      if (objToString.call(re) !== '[object RegExp]') misuse('matches() needs a RegExp.');
      const safe = new RegExp(re.source, re.flags.replace(/[gy]/g, ''));
      addRule(d, 'matches', 'match /' + clip(re.source, 40) + '/', 'string', (v) => typeof v === 'string' && safe.test(v));
    },
    email(d) {
      addRule(d, 'email', 'be an email address', 'string',
        (v) => typeof v === 'string' && v.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(v));
    },
    uuid(d) { addRule(d, 'uuid', 'be a UUID', 'string', (v) => typeof v === 'string' && UUID_RE.test(v)); },
    required(d) { setPresence(d, 'required'); },
    defined(d) { setPresence(d, 'required'); },
    optional(d) { setPresence(d, 'optional'); },
    nullable(d) { d.nullable = true; },
    trim(d) { d.trim = true; },
    default(d, value) {
      if (d.hasDefault) misuse('default already set.');
      if (value !== null && (typeof value === 'object' || typeof value === 'function') && !Object.isFrozen(value)) {
        misuse('default() needs a primitive or a frozen object, so calls cannot share mutable state.');
      }
      d.hasDefault = true;
      d.defaultValue = value;
    },
    toNumber(d) { setCoerce(d, 'number', ['number', 'integer'], 'number', 'finite number', isNumber, 'toNumber', 'a number or integer type'); },
    toInteger(d) { setCoerce(d, 'number', ['integer'], 'integer', 'integer', isInteger, 'toInteger', 'an integer type'); },
    toDate(d) { setCoerce(d, 'date', ['date'], 'date', 'valid Date', isValidDate, 'toDate', 'a date type'); },
    doc(d, text) {
      if (typeof text !== 'string') misuse('doc() needs a string.');
      d.doc = text;
    }
  };
  METHODS.oneOfTypes = METHODS.union;
  const METHOD_NAMES = Object.keys(METHODS);

  // ---- sanitizing ---------------------------------------------------------------------------------

  function localDateFrom(m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const day = Number(m[3]);
    const d = new Date(y, mo - 1, day);
    return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day ? d : null;
  }

  /** Explicit coercion. On failure the original value is returned and the type check reports it. */
  function coerce(kind, v) {
    if (kind === 'number') {
      return typeof v === 'string' && v.length <= MAX_COERCE_LENGTH && DECIMAL_RE.test(v) ? Number(v) : v;
    }
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'string') {
      const m = DATE_ONLY_RE.exec(v);
      if (m !== null) return localDateFrom(m) || v; // date-only means local midnight, never UTC
      return DATE_TIME_RE.test(v) ? new Date(v) : v;
    }
    if (v === null || typeof v !== 'object') return v;
    const t = dateTime(v);
    return t === undefined ? v : new Date(t); // copy, so the callee owns its Date
  }

  // ---- compiling a definition into a checker: value -> sanitized value or Issue -----------------

  function typeIssue(d, v) {
    const after = d.coerce === null ? '' : ' (after ' + (d.coerce === 'number' ? 'toNumber' : 'toDate') + ')';
    return new Issue('type', 'expected ' + d.typeName + after + ', received ' + describe(v) + '.');
  }

  function compileDef(d) {
    for (const r of d.rules) {
      if (r.needs !== null && KNOWN_KINDS.indexOf(d.typeKind) !== -1 && NEEDS[r.needs].kinds.indexOf(d.typeKind) === -1) {
        misuse(r.id + ' needs ' + NEEDS[r.needs].text + ', not ' + d.typeName + '.');
      }
    }
    const preRules = d.rules.filter((r) => r.needs === 'length');
    const postRules = d.rules.filter((r) => r.needs !== 'length');
    const shapeKeys = d.shape === null ? null : Object.keys(d.shape);
    const shapeChecks = shapeKeys === null ? null : shapeKeys.map((k) => checkerOf(d.shape[k]));
    const elementCheck = d.element === null ? null : checkerOf(d.element);
    const memberChecks = d.members === null ? null : d.members.map(checkerOf);

    function runRules(rules, v) {
      for (const r of rules) {
        if (!r.test(v)) return new Issue(r.id, 'must ' + r.label + ', received ' + describe(v) + '.');
      }
      return null;
    }

    function checkShape(v) {
      const out = {};
      for (let i = 0; i < shapeKeys.length; i++) {
        const k = shapeKeys[i];
        const r = shapeChecks[i](hasOwn.call(v, k) ? v[k] : undefined);
        if (r instanceof Issue) { r.path.unshift(k); return r; }
        if (r !== undefined) out[k] = r;
      }
      for (const k of Reflect.ownKeys(v)) {
        if (typeof k === 'string' && hasOwn.call(d.shape, k)) continue;
        let issue = null;
        if (typeof k === 'string' && UNSAFE_KEYS.indexOf(k) !== -1) issue = new Issue('unsafeKey', 'is a reserved key name and is not allowed.');
        else if (!d.loose) issue = new Issue('unknownKey', 'is not an allowed key.');
        if (issue !== null) { issue.path.push(keyLabel(k)); return issue; }
        if (typeof k === 'string' && Object.prototype.propertyIsEnumerable.call(v, k)) out[k] = v[k];
      }
      return out;
    }

    function checkElements(v) {
      const out = new Array(v.length);
      for (let i = 0; i < v.length; i++) {
        const r = elementCheck(v[i]);
        if (r instanceof Issue) { r.path.unshift(i); return r; }
        out[i] = r;
      }
      return out;
    }

    function checkUnion(v) {
      let specific = null;
      for (const mc of memberChecks) {
        const r = mc(v);
        if (!(r instanceof Issue)) return r;
        if (specific === null && r.rule !== 'type') specific = r;
      }
      return specific !== null ? specific : typeIssue(d, v);
    }

    function check(value) {
      let v = value === undefined && d.hasDefault ? d.defaultValue : value;
      if (v === undefined) return d.presence === 'optional' ? undefined : new Issue('required', 'is required but was undefined.');
      if (v === null) return d.nullable ? null : new Issue('null', 'must not be null.');
      if (d.trim && typeof v === 'string') v = v.trim();
      if (d.coerce !== null) v = coerce(d.coerce, v);
      if (d.typeCheck !== null && !d.typeCheck(v)) return typeIssue(d, v);
      const pre = runRules(preRules, v);
      if (pre !== null) return pre;
      if (memberChecks !== null) v = checkUnion(v);
      else if (shapeKeys !== null) v = checkShape(v);
      else if (elementCheck !== null) v = checkElements(v);
      if (v instanceof Issue) return v;
      const post = runRules(postRules, v);
      return post !== null ? post : v;
    }

    if (d.hasDefault) {
      const r = check(undefined);
      if (r instanceof Issue) misuse('default value fails its own schema: ' + r.detail);
    }
    return check;
  }

  /** Run a schema at the boundary: sanitized value, or a thrown ValidationError. */
  function runChecked(fnName, param, schema, value) {
    let r;
    try {
      r = checkerOf(schema)(value);
    } catch (err) {
      if (err instanceof MisuseError || err instanceof ValidationError) throw err;
      console.error('v_: ' + fnName + '(' + param + ') threw while reading the value (accessor, Proxy or predicate); rejecting it as unreadable.',
        err instanceof Error ? err.stack : err);
      r = new Issue('unreadable', 'could not be read (an accessor or Proxy threw).');
    }
    if (r instanceof Issue) {
      r.path.unshift(param);
      const path = formatPath(r.path);
      throw new ValidationError(fnName + '(' + path + '): ' + r.detail, { fnName: fnName, param: param, rule: r.rule, path: path });
    }
    return r;
  }

  function hasTransforms(s) {
    const d = s._def;
    if (d.trim || d.coerce !== null || d.hasDefault) return true;
    if (d.shape !== null && Object.keys(d.shape).some((k) => hasTransforms(d.shape[k]))) return true;
    if (d.element !== null && hasTransforms(d.element)) return true;
    return d.members !== null && d.members.some(hasTransforms);
  }

  function requireArrayLike(x, who) {
    if (x === null || typeof x !== 'object' || typeof x.length !== 'number') misuse(who + ' needs an array-like (arguments or an array).');
  }

  // ---- docs: JSDoc rendering ----------------------------------------------------------------------

  function isOptionalDef(d) {
    return d.presence === 'optional' || d.hasDefault;
  }

  function jsdocType(d) {
    let t = d.typeName;
    if (d.shape !== null) {
      t = '{' + Object.keys(d.shape).map((k) => {
        const sub = d.shape[k]._def;
        return k + (isOptionalDef(sub) ? '?' : '') + ': ' + jsdocType(sub);
      }).join(', ') + '}';
    } else if (d.element !== null) {
      t = 'Array<' + jsdocType(d.element._def) + '>';
    } else if (d.members !== null) {
      t = '(' + d.members.map((m) => jsdocType(m._def)).join('|') + ')';
    }
    return d.nullable ? '?' + t : t;
  }

  function docText(d, doc) {
    const parts = [];
    if (doc !== '') parts.push(doc);
    if (d.rules.length > 0) parts.push('Must ' + d.rules.map((r) => r.label).join(', must ') + '.');
    return parts.join(' ');
  }

  function paramLines(name, d, doc, out) {
    let label = name;
    if (d.hasDefault) label = '[' + name + '=' + renderValue(d.defaultValue) + ']';
    else if (d.presence === 'optional') label = '[' + name + ']';
    const text = docText(d, doc);
    out.push(' * @param {' + jsdocType(d) + '} ' + label + (text === '' ? '' : ' - ' + text));
    let nested = d.shape !== null ? d : null;
    let prefix = name + '.';
    if (nested === null && d.element !== null && d.element._def.shape !== null) {
      nested = d.element._def;
      prefix = name + '[].';
    }
    if (nested !== null) {
      for (const k of Object.keys(nested.shape)) paramLines(prefix + k, nested.shape[k]._def, nested.shape[k]._def.doc, out);
    }
  }

  function specOf(name, params, returns, returnsDoc, allowExtra, enforce) {
    return Object.freeze({
      name: name,
      params: Object.freeze(params.map((p) => Object.freeze({
        name: p.name,
        doc: p.doc,
        type: jsdocType(p.schema._def),
        optional: isOptionalDef(p.schema._def),
        nullable: p.schema._def.nullable,
        hasDefault: p.schema._def.hasDefault,
        defaultValue: p.schema._def.defaultValue,
        rules: Object.freeze(p.schema._def.rules.map((r) => r.label))
      }))),
      returns: returns === null ? null : Object.freeze({ type: jsdocType(returns._def), doc: returnsDoc }),
      allowExtraArgs: allowExtra,
      enforceReturns: enforce
    });
  }

  /** Private registry: wrapped function or compiled validator to its contract. */
  const contracts = new WeakMap();

  // ---- function builders -------------------------------------------------------------------------

  class FnBuilder {
    constructor(fnName, argsLike) {
      if (fnName !== undefined && (typeof fnName !== 'string' || fnName === '')) misuse('fn name must be a non-empty string.');
      this._name = fnName;
      this._args = argsLike;
      this._params = [];
      this._names = new Set();
      this._current = null;
      this._sealed = false;
      this._allowExtra = false;
      this._returns = null;
      this._returnsDoc = '';
      this._enforce = false;
      this._out = [];
    }

    _assertOpen() {
      if (this._sealed) misuse((this._name || 'fn') + ' builder is sealed; build a new v_.fn() instead.');
    }

    _assertFnMode(what) {
      if (this._args !== null) misuse('guard() validates in place; ' + what + ' needs v_.fn() instead.');
    }

    param(name, a, b) {
      this._assertOpen();
      if (typeof name !== 'string' || name === '') misuse('param name must be a non-empty string.');
      if (this._names.has(name)) misuse('duplicate param "' + name + '".');
      const doc = typeof a === 'string' ? a : '';
      const schema = typeof a === 'string' ? b : a;
      if (schema !== undefined) requireSchema(schema, 'param("' + name + '")');
      this._close();
      this._names.add(name);
      this._current = new ParamBuilder(this, name, doc, schema === undefined ? newDef() : cloneDef(schema._def));
      return this._current;
    }

    _close() {
      const pb = this._current;
      if (pb === null) return;
      this._current = null;
      pb._closed = true;
      const entry = { name: pb._name, doc: pb._doc === '' ? pb._def.doc : pb._doc, schema: new Schema(pb._def) };
      this._params.push(entry);
      if (this._args !== null) {
        const i = this._params.length - 1;
        openGuard = null;
        this._out[i] = runChecked(this._name || 'anonymous', entry.name, entry.schema, this._args[i]);
        openGuard = this;
      }
    }

    allowExtraArgs() { this._assertOpen(); this._allowExtra = true; return this; }
    exactArgs() { this._assertOpen(); this._allowExtra = false; return this; }

    returns(schema, doc) {
      this._assertOpen();
      this._assertFnMode('returns()');
      requireSchema(schema, 'returns()');
      if (this._returns !== null) misuse('returns() already set.');
      if (hasTransforms(schema)) misuse('return contracts validate, they do not sanitize: remove trim, default and to* coercions.');
      this._returns = schema;
      this._returnsDoc = typeof doc === 'string' ? doc : '';
      return this;
    }

    enforceReturns() {
      this._assertOpen();
      this._assertFnMode('enforceReturns()');
      this._enforce = true;
      return this;
    }

    _seal(name) {
      this._assertOpen();
      this._close();
      this._sealed = true;
      if (this._enforce && this._returns === null) misuse('enforceReturns() needs returns().');
      for (const p of this._params) checkerOf(p.schema); // compile now: misuse surfaces at definition time
      if (this._returns !== null) checkerOf(this._returns);
      const contract = {
        name: name,
        params: this._params,
        allowExtra: this._allowExtra,
        returns: this._returns,
        spec: specOf(name, this._params, this._returns, this._returnsDoc, this._allowExtra, this._enforce)
      };
      return contract;
    }

    compile() {
      this._assertFnMode('compile()');
      const c = this._seal(this._name || 'anonymous');
      const validate = function validate(argsLike) {
        requireArrayLike(argsLike, c.name + ' validator');
        return validateArgs(c, argsLike, []);
      };
      Object.defineProperty(validate, 'spec', { value: c.spec });
      contracts.set(validate, c);
      return validate;
    }

    implement(fn) {
      this._assertFnMode('implement()');
      if (typeof fn !== 'function') misuse('implement() needs a function.');
      const name = this._name || fn.name || 'anonymous';
      if (fn.length > this._params.length + (this._current === null ? 0 : 1)) {
        misuse(name + ' declares ' + fn.length + ' parameter(s) but the spec has ' +
          (this._params.length + (this._current === null ? 0 : 1)) + '; add a param() for each.');
      }
      const c = this._seal(name);
      const enforce = this._enforce;
      const wrapped = function (...args) {
        validateArgs(c, args, args); // args is our own rest array, so sanitizing it in place is safe
        if (new.target !== undefined) return Reflect.construct(fn, args);
        const result = fn.apply(this, args);
        return enforce ? enforceResult(c, result) : result;
      };
      Object.defineProperty(wrapped, 'name', { value: name });
      Object.defineProperty(wrapped, 'length', { value: fn.length });
      Object.defineProperty(wrapped, 'spec', { value: c.spec });
      contracts.set(wrapped, c);
      return wrapped;
    }

    done(argsLike) {
      if (this._args === null) return this.compile()(argsLike);
      if (argsLike !== undefined) misuse('guard() already has its arguments; call done() with none.');
      this._assertOpen();
      this._close();
      this._sealed = true;
      openGuard = null;
      checkArity(this._name || 'anonymous', this._args.length, this._params.length, this._allowExtra);
      for (let i = this._params.length; i < this._args.length; i++) this._out[i] = this._args[i];
      return this._out;
    }
  }

  function checkArity(fnName, received, max, allowExtra) {
    if (!allowExtra && received > max) {
      throw new ValidationError(fnName + ': expected at most ' + max + ' argument(s), received ' + received + '.',
        { fnName: fnName, param: null, rule: 'arity', path: '' });
    }
  }

  function validateArgs(c, argsLike, out) {
    checkArity(c.name, argsLike.length, c.params.length, c.allowExtra);
    for (let i = 0; i < c.params.length; i++) out[i] = runChecked(c.name, c.params[i].name, c.params[i].schema, argsLike[i]);
    for (let i = c.params.length; i < argsLike.length; i++) out[i] = argsLike[i];
    return out;
  }

  function enforceResult(c, result) {
    if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
      return result.then((v) => { runChecked(c.name, 'return', c.returns, v); return v; });
    }
    runChecked(c.name, 'return', c.returns, result);
    return result;
  }

  class ParamBuilder {
    constructor(parent, name, doc, def) {
      this._parent = parent;
      this._name = name;
      this._doc = doc;
      this._def = def;
      this._closed = false;
    }

    param(name, a, b) { return this._parent.param(name, a, b); }
    implement(fn) { return this._parent.implement(fn); }
    compile() { return this._parent.compile(); }
    done(argsLike) { return this._parent.done(argsLike); }
    returns(schema, doc) { this._parent.returns(schema, doc); return this; }
    enforceReturns() { this._parent.enforceReturns(); return this; }
    allowExtraArgs() { this._parent.allowExtraArgs(); return this; }
    exactArgs() { this._parent.exactArgs(); return this; }
  }

  const ROOT = new Schema(newDef());
  const api = {};
  for (const name of METHOD_NAMES) {
    const apply = METHODS[name];
    Schema.prototype[name] = function (...args) {
      const d = cloneDef(this._def);
      apply(d, ...args);
      return new Schema(d);
    };
    ParamBuilder.prototype[name] = function (...args) {
      if (this._closed) misuse('param "' + this._name + '" is closed; chain its rules before the next param().');
      this._parent._assertOpen();
      apply(this._def, ...args);
      return this;
    };
    api[name] = (...args) => ROOT[name](...args);
  }

  function contractOf(fn, who) {
    const c = typeof fn === 'function' ? contracts.get(fn) : undefined;
    if (c === undefined) misuse(who + ' needs a function built by v_ (implement or compile); this one is not built by v_.');
    return c;
  }

  return Object.freeze(Object.assign(api, {
    /** Start a validated function contract. */
    fn(name) { return new FnBuilder(name, null); },

    /** Validate arguments in place; end the chain with done(), which returns the sanitized args. */
    guard(argsLike, name) {
      if (openGuard !== null) {
        const stale = openGuard._name || 'anonymous';
        misuse('guard for ' + stale + ' never called done(); every guard chain must end with done().');
      }
      requireArrayLike(argsLike, 'guard()');
      const b = new FnBuilder(name, argsLike);
      openGuard = b;
      return b;
    },

    /** Validate and sanitize one value against a schema; returns the sanitized value. */
    assertShape(schema, value, label = 'value') {
      requireSchema(schema, 'assertShape()');
      return runChecked('assertShape', label, schema, value);
    },

    /** Test helper: assert a return value against the returns() contract of a v_ function. */
    checkReturn(fn, value) {
      const c = contractOf(fn, 'checkReturn()');
      if (c.returns === null) misuse(c.name + ' has no returns() contract.');
      runChecked(c.name, 'return', c.returns, value);
      return true;
    },

    /** JSDoc-equivalent text for a v_ function or compiled validator. */
    describe(fn) {
      const c = contractOf(fn, 'describe()');
      const out = ['/**', ' * ' + c.name];
      for (const p of c.params) paramLines(p.name, p.schema._def, p.doc, out);
      if (c.returns !== null) {
        const doc = c.spec.returns.doc;
        out.push(' * @returns {' + c.spec.returns.type + '}' + (doc === '' ? '' : ' - ' + doc));
      }
      out.push(' */');
      return out.join('\n');
    },

    ValidationError: ValidationError
  }));
})();

export const ValidationError = v_.ValidationError;
