/**
 * @file errorTrayRetryBinding.test.js
 * @description Alpine calls any binding expression that evaluates to a function. The error tray's Retry
 * button had x-show="entry.retry", so every render ran the retry; a failing retry filed a new entry, which
 * re-rendered and retried again: an endless loop that froze the live /dev app on the first failed note save
 * (2026-10-10). Checks both client copies.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const FILES = ['../index.html', '../gas-app/Index.html'];

// Mirrors Alpine's evaluator: a function-valued result is invoked with the scope.
function alpineEvaluate(expr, scope) {
  const value = new Function(...Object.keys(scope), `return (${expr});`)(...Object.values(scope));
  return typeof value === 'function' ? value() : value;
}

for (const rel of FILES) {
  test(`${rel}: rendering the Retry button never runs the retry`, () => {
    const html = fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
    const m = html.match(/<button[^>]*class="error-tray-action"[^>]*x-show="([^"]+)"/);
    assert.ok(m, 'error-tray-action x-show not found');
    let calls = 0;
    const shown = alpineEvaluate(m[1], { entry: { retry: () => { calls += 1; } } });
    assert.equal(calls, 0, `x-show="${m[1]}" invokes entry.retry on render`);
    assert.equal(shown, true);
    assert.equal(alpineEvaluate(m[1], { entry: { retry: null } }), false);
  });
}
