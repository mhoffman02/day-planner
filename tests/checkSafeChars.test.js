/**
 * @file checkSafeChars.test.js
 * @description tools/check-gas-script-html-safe-chars.js checks EVERY inline script and style block of
 * every gas-app/*.html file, not only the first block of Script.html: HtmlService truncates any of them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TOOL = path.resolve('tools/check-gas-script-html-safe-chars.js');

/**
 * @param {string} html File content.
 * @returns {{status:number, out:string}} Exit status and combined output.
 */
function check(html) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'safechars-'));
  const file = path.join(dir, 'Page.html');
  fs.writeFileSync(file, html);
  const r = spawnSync(process.execPath, [TOOL, file], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: r.status, out: r.stdout + r.stderr };
}

test('a clean page with several blocks and a scriptlet passes', () => {
  const r = check('<script>\nvar a = 1;\n</script>\n<script>var b = <?= n ?>;</script>\n<style>/* plain */ a { color: red; }</style>\n');
  assert.equal(r.status, 0, r.out);
});

test('a bad SECOND script block fails with its file line', () => {
  const r = check('<script>\nvar a = 1;\n</script>\n<p>x</p>\n<script>(function(){\n  var u = "https://x";\n})();</script>\n');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /line 6: \/\/ inside a string/);
});

test('a script block with attributes is checked; one with src is skipped', () => {
  const r = check('<script src="https://cdn.example/x.js"></script>\n<script type="module">\n// it\'s here\n</script>\n');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /line 3: apostrophe inside a comment/);
});

test('an apostrophe in a CSS comment fails', () => {
  const r = check('<style>\n/* don\'t */\n.a { color: red; }\n</style>\n');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /line 2: apostrophe inside a CSS comment/);
});
