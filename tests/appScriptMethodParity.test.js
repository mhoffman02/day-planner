import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// check-mirror compares only functions present in both files; a method added to src/app.js but
// never copied into gas-app/Script.html works in the mock and throws on GAS (2026-11-14 Topic picker).
const METHOD = /^ {6}(?:async )?(?:get )?([A-Za-z_$][\w$]*)\([^)]*\) \{$/gm;

export function appMethodNames(source) {
  return new Set([...source.matchAll(METHOD)].map(m => m[1]));
}

test('every plannerApp method and getter in src/app.js also exists in gas-app/Script.html', () => {
  const app = appMethodNames(fs.readFileSync('src/app.js', 'utf8'));
  const gas = appMethodNames(fs.readFileSync(process.env.SCRIPT_HTML || 'gas-app/Script.html', 'utf8'));
  assert.ok(app.size > 100, `parsed only ${app.size} methods from src/app.js`);
  const missing = [...app].filter(n => !gas.has(n));
  assert.deepEqual(missing, [], `missing from Script.html: ${missing.join(', ')}`);
});
