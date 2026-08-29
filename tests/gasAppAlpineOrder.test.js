'use strict';

// Regression test for a v83-era outage: Index.html loaded Alpine's CDN script with `defer`
// in <head>, registering plannerApp via an alpine:init listener in Script.html -- the
// officially documented pattern. GAS's sandboxed-iframe content loader doesn't reliably honor
// defer's execution-order guarantee, so Alpine could start scanning the DOM before Script.html's
// registration code ran, throwing "plannerApp is not defined" for every x-data/x-show/x-if/
// x-text binding on both /dev and /exec. Since GAS templating can't run outside the Apps Script
// runtime, this is a static contract check: it asserts Alpine's script tag is not deferred in
// <head>, and instead appears in document order after Script.html's include, so registration is
// guaranteed to run first by plain synchronous script execution rather than defer/event timing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const indexHtml = fs.readFileSync(path.join(__dirname, '../gas-app/Index.html'), 'utf8');

test('Alpine CDN script is not deferred in <head>', () => {
  const headMatch = indexHtml.match(/<head[\s\S]*?<\/head>/);
  assert.ok(headMatch, 'expected a <head> section in Index.html');
  assert.ok(
    !/alpinejs.*\.js/.test(headMatch[0]),
    'Alpine\'s CDN script must not load from <head> (defer timing is not honored by GAS\'s ' +
      'sandboxed-iframe content loader) -- it must load after Script.html\'s include instead'
  );
});

test('Alpine CDN script loads without `defer`, after the Script.html include', () => {
  const scriptIncludeIndex = indexHtml.search(/<\?!=\s*include\(['"]Script['"]\);\s*\?>/);
  assert.ok(scriptIncludeIndex !== -1, 'expected an include(\'Script\') scriptlet in Index.html');

  const alpineTagMatch = indexHtml.match(/<script[^>]*alpinejs[^>]*>/);
  assert.ok(alpineTagMatch, 'expected an Alpine CDN <script> tag in Index.html');
  assert.ok(!/\bdefer\b/.test(alpineTagMatch[0]), 'Alpine\'s script tag must not use `defer`');

  const alpineTagIndex = indexHtml.indexOf(alpineTagMatch[0]);
  assert.ok(
    alpineTagIndex > scriptIncludeIndex,
    'Alpine\'s script tag must appear after the Script.html include in document order, so ' +
      'plannerApp registration is guaranteed to run before Alpine starts scanning the DOM'
  );
});
