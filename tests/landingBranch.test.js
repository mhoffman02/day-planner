// Guard for tools/landing-branch.js: deploy-home.js must refuse to push HOME from a branch behind
// origin/pure-gas-main, or when GitHub cannot be reached to tell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertLandingCurrent } from '../tools/landing-branch.js';

const fakeGit = ({ log = '', fail = null }) => (...args) => {
  if (fail && args[0] === 'fetch') throw new Error(fail);
  return args[0] === 'log' ? log : '';
};

test('a branch that has every origin/pure-gas-main commit passes', () => {
  assert.doesNotThrow(() => assertLandingCurrent('.', fakeGit({ log: '' })));
});

test('a branch behind origin/pure-gas-main is refused, naming the missing commit and the rebase', () => {
  assert.throws(() => assertLandingCurrent('.', fakeGit({ log: '3ea4e66 docs(handoff): security review' })),
    /refusing to deploy[\s\S]*3ea4e66 docs\(handoff\)[\s\S]*git rebase origin\/pure-gas-main/);
});

test('an unreachable GitHub is refused (fail closed)', () => {
  assert.throws(() => assertLandingCurrent('.', fakeGit({ fail: 'Could not resolve host' })),
    /refusing to deploy[\s\S]*Could not resolve host/);
});
