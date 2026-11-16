/**
 * @file checkFlakyTests.test.js
 * @description tools/check-flaky-tests.js (A17.9, .agents/rules/zero-flaky-tests.md): a flaky test is fixed or
 * deleted the same day, never retried, rerun or skipped. The gate fails on retry counts in tests, skip/todo
 * marks, --test-rerun-failures in scripts or CI, and continue-on-error or retry actions in CI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TOOL = path.resolve('tools/check-flaky-tests.js');

/**
 * @param {Record<string,string>} files Relative path -> content, written to a temp dir and passed to the tool.
 * @returns {{status:number, out:string}} Exit status and combined output.
 */
function check(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaky-'));
  const paths = Object.entries(files).map(([rel, body]) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
    return p;
  });
  const r = spawnSync(process.execPath, [TOOL, ...paths], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: r.status, out: r.stdout + r.stderr };
}

test('the repo as committed passes', () => {
  const r = spawnSync(process.execPath, [TOOL], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('plain tests and a retry callback property pass', () => {
  const r = check({ 'a.test.js': "test('x', () => {});\nconst entry = { retry: () => {} };\n" });
  assert.equal(r.status, 0, r.out);
});

for (const [name, body] of [
  ['a retry count', "test('x', { retry: 3 }, () => {});\n"],
  ['a retries count', "it('x', { retries: 2 }, () => {});\n"],
  ['test.skip', "test.skip('x', () => {});\n"],
  ['it.todo', "it.todo('x');\n"],
  ['a skip option', "test('x', { skip: 'flaky on CI' }, () => {});\n"],
  ['a todo option', "describe('x', { todo: true }, () => {});\n"],
]) {
  test(`fails on ${name} in a test file, naming file:line`, () => {
    const r = check({ 'b.test.js': `// header\n${body}` });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /b\.test\.js:2/);
  });
}

test('fails on --test-rerun-failures in package.json', () => {
  const r = check({ 'package.json': '{ "scripts": { "test": "node --test --test-rerun-failures=.rerun tests" } }\n' });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /package\.json:1/);
});

test('fails on continue-on-error and retry actions in a workflow', () => {
  const r = check({ 'ci.yml': 'steps:\n  - run: npm test\n    continue-on-error: true\n  - uses: nick-fields/retry@v3\n' });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /ci\.yml:3/);
  assert.match(r.out, /ci\.yml:4/);
});
