/**
 * @file hubLogSafe.test.js
 * @description DPQueue.logSafe must console.error the sanitized message plus the stack frames, but
 * never the V8 stack header, which repeats the raw (possibly PII-bearing) message.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHubContext, lines } from './helpers/gasFakesHub.js';

test('logSafe logs stack frames and the sanitized message, never the raw email', () => {
  const ctx = makeHubContext();
  ctx.__consoleLines.length = 0;
  const err = new Error('send failed for pat@example.test\nsecond line kim@example.test');
  ctx.DPQueue.logSafe('ctx', err);
  const out = lines(ctx);
  assert.match(out, /^ctx: /);
  assert.match(out, /\[email\]/);
  assert.match(out, /\n\s+at /, 'stack frames must be logged');
  assert.doesNotMatch(out, /pat@example\.test/);
  assert.doesNotMatch(out, /kim@example\.test/);
});

test('logSafe accepts a non-Error value without throwing', () => {
  const ctx = makeHubContext();
  ctx.__consoleLines.length = 0;
  ctx.DPQueue.logSafe('ctx', 'plain string from x@example.test');
  const out = lines(ctx);
  assert.match(out, /^ctx: plain string from \[email\]/);
  assert.doesNotMatch(out, /x@example\.test/);
});
