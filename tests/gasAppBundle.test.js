'use strict';

// Regression test for the v83 "double-embedded bundle" outage: getCompiledAppBundle()
// evaluated the Index.html template (which inlines Script.html's content via
// `<?!= include('Script'); ?>`) AND separately returned Script.html's raw content as
// bundle.script. gh-pwa-shell concatenates bundle.html + bundle.script into one <script>
// tag, so Script.html's top-level `const`/`let` declarations landed twice -> fatal
// SyntaxError, blank app. HtmlService/templating can't run outside the Apps Script
// runtime, so this is a static contract check: it asserts Index.html's Script include is
// gated behind a flag, and that getCompiledAppBundle() sets that flag before evaluating
// the template -- so the bundle's `html` field never carries an inlined copy of Script.html
// alongside the separate `script` field.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const indexHtml = fs.readFileSync(path.join(__dirname, '../gas-app/Index.html'), 'utf8');
const codeGs = fs.readFileSync(path.join(__dirname, '../gas-app/Code.gs'), 'utf8');

test('Index.html gates the Script include behind an isBundleExport flag', () => {
  const includeLine = indexHtml.match(/<\?[\s\S]{0,80}include\(['"]Script['"]\)[\s\S]{0,10}\?>/);
  assert.ok(includeLine, 'expected an include(\'Script\') scriptlet in Index.html');

  const guardBlock = indexHtml.match(/<\?[^>]*isBundleExport[\s\S]*?include\(['"]Script['"]\)[\s\S]*?\?>/);
  assert.ok(
    guardBlock,
    'include(\'Script\') must be wrapped in a conditional that checks isBundleExport, ' +
      'so the bundle-export path can skip inlining it (it is already carried separately as bundle.script)'
  );
});

test('getCompiledAppBundle() sets isBundleExport before evaluating the Index template', () => {
  const fnMatch = codeGs.match(/function getCompiledAppBundle\(\)[\s\S]*?\n}/);
  assert.ok(fnMatch, 'expected to find getCompiledAppBundle() in Code.gs');
  const fnBody = fnMatch[0];

  const setsFlag = /isBundleExport\s*=\s*true/.test(fnBody);
  assert.ok(
    setsFlag,
    'getCompiledAppBundle() must set template.isBundleExport = true before evaluating ' +
      'the Index template, or the resulting bundle.html will double-embed Script.html ' +
      'alongside bundle.script'
  );

  const flagSetBeforeEvaluate = /isBundleExport\s*=\s*true[\s\S]*?\.evaluate\(\)/.test(fnBody);
  assert.ok(flagSetBeforeEvaluate, 'isBundleExport must be set before template.evaluate() is called');
});

test('doGet()\'s standalone template evaluation does not set isBundleExport', () => {
  const fnMatch = codeGs.match(/function doGet\(e\)[\s\S]*?\n}\n/);
  assert.ok(fnMatch, 'expected to find doGet() in Code.gs');
  assert.ok(
    !/isBundleExport/.test(fnMatch[0]),
    'doGet()\'s direct-load path must NOT set isBundleExport, so the standalone app still gets its inline script'
  );
});
