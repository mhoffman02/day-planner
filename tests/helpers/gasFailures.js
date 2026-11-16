/**
 * @file gasFailures.js
 * @description Failure injection for the GAS service stubs (TODO A17.5). injectFailure(ctx, 'Tasks.Tasks.list', 'quota')
 * makes that stubbed Advanced Service / built-in method throw the error text the real service throws, so a test
 * can prove an RPC fails loud: it throws a user-facing Error or returns its family's error envelope, AND the
 * stack reached console.error. Use assertFailsLoud(ctx, fn) for the outcome check.
 * The messages are the live ones seen on HOME/WORK (Apps Script wraps Advanced Service errors as
 * "API call to <service>.<resource>.<method> failed with error: <reason>").
 */
import assert from 'node:assert/strict';

/** Failure kinds -> reason text the platform produces. */
export const FAILURE_KINDS = Object.freeze({
  quota: 'Service invoked too many times for one day: calendar. Rate Limit Exceeded',
  forbidden: 'Forbidden',
  notFound: 'Not Found',
  timeout: 'Exceeded maximum execution time'
});

const HTTP_CODE = { quota: 429, forbidden: 403, notFound: 404 };

/**
 * Builds the error a stubbed service throws for a kind.
 * @param {string} kind One of Object.keys(FAILURE_KINDS).
 * @param {string} apiPath e.g. 'Tasks.Tasks.list'; becomes "tasks.tasks.list" in the Apps Script wrapper text.
 * @returns {Error} Host-realm Error with a real stack (and .code for HTTP kinds).
 */
export function failureError(kind, apiPath) {
  if (!(kind in FAILURE_KINDS)) throw new Error(`gasFailures: unknown failure kind ${kind}`);
  const reason = FAILURE_KINDS[kind];
  // The quota and timeout texts come from the runtime itself, not the API wrapper.
  const message = (kind === 'quota' || kind === 'timeout') ? reason : `API call to ${apiPath.toLowerCase()} failed with error: ${reason}`;
  const err = new Error(message);
  if (HTTP_CODE[kind]) err.code = HTTP_CODE[kind];
  return err;
}

/**
 * Replaces ctx.<path> (a function on a stubbed service) with one that throws failureError(kind, path).
 * @param {object} ctx makeGasContext() context.
 * @param {string} apiPath Dotted path from the context, e.g. 'Calendar.Events.patch'.
 * @param {string} kind Failure kind.
 * @param {{when?: function(...*): boolean}} [opts] when(...args) false lets the original run (e.g. skip a probe call).
 * @returns {{calls: number}} Live count of injected throws.
 */
export function injectFailure(ctx, apiPath, kind, opts = {}) {
  const parts = apiPath.split('.');
  const method = parts.pop();
  const owner = parts.reduce((o, k) => o[k], ctx);
  assert.equal(typeof owner[method], 'function', `gasFailures: ${apiPath} is not a stubbed function`);
  const original = owner[method];
  const state = { calls: 0 };
  owner[method] = function (...args) {
    if (opts.when && !opts.when(...args)) return original.apply(this, args);
    state.calls += 1;
    throw failureError(kind, apiPath);
  };
  return state;
}

/** console.error / logError lines that carry a stack frame (the stub console collects all levels in ctx.__consoleLines). */
export function stackLines(ctx) {
  return ctx.__consoleLines.filter((l) => /\n\s+at \S/.test(l));
}

/** A user-facing message: non-empty text, no stack frames, no object dump. */
export function assertUserFacing(message, label) {
  assert.equal(typeof message, 'string', `${label}: message must be a string, got ${typeof message}`);
  assert.ok(message.trim().length > 0, `${label}: message is empty`);
  assert.ok(!/\n\s+at \S/.test(message), `${label}: message carries a stack: ${message}`);
  assert.ok(!/\[object \w+\]|^\s*[{[]/.test(message), `${label}: message is a raw object dump: ${message}`);
}

/**
 * Runs fn and asserts it failed loud: it threw a user-facing Error, or returned a recognised error envelope
 * (Code.gs friendly {success:false,error}, hub makeResult {ok:false,message}, or a non-empty warnings list),
 * and a stack reached the console. Never accepts silent success or empty data.
 * @param {object} ctx The context whose console is inspected.
 * @param {function(): *} fn The RPC call.
 * @param {{envelope?: string}} [opts] envelope: 'warnings' demands result.warnings non-empty (day loaders).
 * @returns {{threw: boolean, value: *}} What happened, for extra assertions.
 */
export function assertFailsLoud(ctx, fn, opts = {}) {
  let threw = false;
  let value;
  try {
    value = fn();
  } catch (err) {
    threw = true;
    assert.ok(err instanceof Error || (err && typeof err.message === 'string'), `thrown value is not an Error: ${String(err)}`);
    assertUserFacing(err.message, 'thrown');
  }
  if (!threw) {
    const v = JSON.parse(JSON.stringify(value === undefined ? null : value));
    if (opts.envelope === 'warnings') {
      assert.ok(v && Array.isArray(v.warnings) && v.warnings.length > 0, `returned without a warning: ${JSON.stringify(v).slice(0, 300)}`);
      v.warnings.forEach((w, i) => assertUserFacing(w, `warnings[${i}]`));
    } else if (v && v.success === false) {
      assertUserFacing(v.error, 'envelope.error');
    } else if (v && v.ok === false) {
      assertUserFacing(v.message, 'envelope.message');
    } else {
      assert.fail(`silent success: returned ${JSON.stringify(v).slice(0, 300)}`);
    }
  }
  assert.ok(stackLines(ctx).length > 0, 'no console.error line carried a stack:\n' + ctx.__consoleLines.join('\n').slice(0, 600));
  return { threw, value };
}
