// Gate for .agents/rules/test-before-fix.md: a fix/feat/perf commit that touches code must name its red
// run, and a fix must also say why the bug escaped and what guard now catches it (Maguire: never walk
// away from a bug).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCommitMessage } from '../tools/check-commit-msg.js';

const CODE = ['src/app.js'];
const RED = 'Red-run: tests/x.test.js "parses y" failed: expected 2, got 1';
const ESCAPED = 'Escaped-because: unit tests run the JS in a VM, never the served page';
const GUARD = 'Guard-added: safe-chars check bans HTML comment markers';

test('fix touching code without trailers lists every missing one', () => {
  const errs = checkCommitMessage('fix(gas): blank page\n\nbody', CODE);
  assert.equal(errs.length, 3);
  assert.match(errs.join('\n'), /Red-run:/);
  assert.match(errs.join('\n'), /Escaped-because:/);
  assert.match(errs.join('\n'), /Guard-added:/);
});

test('fix with all three trailers passes', () => {
  assert.deepEqual(checkCommitMessage(`fix(gas): blank page\n\n${RED}\n${ESCAPED}\n${GUARD}\n`, CODE), []);
});

test('feat and perf touching code need only Red-run', () => {
  assert.equal(checkCommitMessage('feat(notes): x', CODE).length, 1);
  assert.deepEqual(checkCommitMessage(`feat(notes): x\n\n${RED}`, CODE), []);
  assert.equal(checkCommitMessage('perf: x', ['gas-app/Code.gs']).length, 1);
});

test('an empty trailer value does not count', () => {
  assert.equal(checkCommitMessage('feat: x\n\nRed-run:   \n', CODE).length, 1);
});

test('docs, chore, refactor, test-only and non-code commits are exempt', () => {
  assert.deepEqual(checkCommitMessage('docs(handoff): x', ['HANDOFF.md']), []);
  assert.deepEqual(checkCommitMessage('chore: x', CODE), []);
  assert.deepEqual(checkCommitMessage('refactor: x', CODE), []);
  assert.deepEqual(checkCommitMessage('fix: typo', ['README.md', 'tests/a.test.js']), []);
});

test('merge, revert and fixup commits are exempt', () => {
  assert.deepEqual(checkCommitMessage('Merge branch x', CODE), []);
  assert.deepEqual(checkCommitMessage('Revert "fix: x"', CODE), []);
  assert.deepEqual(checkCommitMessage('fixup! fix: x', CODE), []);
});

test('comment lines from the git editor template are ignored', () => {
  assert.equal(checkCommitMessage(`feat: x\n\n# ${RED}\n`, CODE).length, 1);
});
