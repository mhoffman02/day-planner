import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ESLint } from 'eslint';

const configFile = process.env.LINT_GATE_CONFIG ? path.resolve(process.env.LINT_GATE_CONFIG) : undefined;

async function ruleIds(code, filePath) {
  const eslint = new ESLint({ overrideConfigFile: configFile, ignore: false });
  const [res] = await eslint.lintText(code, { filePath });
  return res.messages.map((m) => m.ruleId);
}

test('tools/: shell-string exec is banned', async () => {
  const ids = await ruleIds("import { execSync } from 'node:child_process';\nexecSync('ls');\n", 'tools/x.js');
  assert.ok(ids.includes('no-restricted-syntax'), `got ${ids}`);
});

test('tools/: fetch without an options object is banned', async () => {
  const ids = await ruleIds("await fetch('http://127.0.0.1:1');\n", 'tools/x.js');
  assert.ok(ids.includes('no-restricted-syntax'), `got ${ids}`);
});

test('tools/: floating promise chain is banned', async () => {
  const ids = await ruleIds('Promise.resolve(1).then((v) => v);\n', 'tools/x.js');
  assert.ok(ids.includes('promise/catch-or-return'), `got ${ids}`);
});

test('complexity above 15 is an error', async () => {
  const branches = Array.from({ length: 16 }, (_, i) => `if (a === ${i}) { return ${i}; }`).join('\n');
  const ids = await ruleIds(`export function f(a) {\n${branches}\nreturn -1;\n}\n`, 'tools/x.js');
  assert.ok(ids.includes('complexity'), `got ${ids}`);
});
