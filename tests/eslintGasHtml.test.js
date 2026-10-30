/**
 * @file eslintGasHtml.test.js
 * @description eslint.config.js lints every inline <script> block of gas-app/*.html at its real file
 * line and column; src= scripts, markup and GAS scriptlets are not linted as JS.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';

const eslint = new ESLint();

/**
 * @param {string} html Page source.
 * @returns {Promise<Array<string>>} `line:column rule` per finding.
 */
async function lint(html) {
  const [res] = await eslint.lintText(html, { filePath: 'gas-app/Probe.html' });
  return res.messages.map((m) => `${m.line}:${m.column} ${m.ruleId || m.message}`);
}

test('a UTC day key in the SECOND script block is reported at its file line', async () => {
  const html = '<p>x</p>\n<script>\nconst a = 1;\n</script>\n<div>y</div>\n<script>(function(){\n  const d = new Date().toISOString().slice(0, 10);\n  return [a, d];\n})();</script>\n';
  assert.deepEqual(await lint(html), ['7:13 no-restricted-syntax']);
});

test('scriptlets, src= scripts and markup are not linted as JS', async () => {
  const html = '<script src="x.js">var ignored = 1;</script>\n<p>if (a == b) var no;</p>\n<script>\nconst n = <?= count ?>;\nconst s = <?!= JSON.stringify(x) ?>;\nwindow.f = () => n + s;\n</script>\n';
  assert.deepEqual(await lint(html), []);
});

test('2T rules apply inside html scripts', async () => {
  const html = '<script>\nlet x = 1;\nif (x == 2) x = 0;\nwindow.y = x === 1 ? "a".substr(1) : 0;\n</script>\n';
  assert.deepEqual(await lint(html), ['3:7 eqeqeq', '4:22 no-restricted-properties']);
});
