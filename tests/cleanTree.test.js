// Gate for tools/clean-tree.js: a deploy must ship exactly a commit. On 2026-10-30 HOME @342 and a WORK
// version shipped an agent's uncommitted gas-app/Engines.gs because clasp pushes the working tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirtyPaths } from '../tools/clean-tree.js';

test('a clean tree has no dirty paths', () => {
  assert.deepEqual(dirtyPaths(''), []);
  assert.deepEqual(dirtyPaths('\n'), []);
});

test('modified, staged and untracked files under gas-app are all dirty', () => {
  const status = ' M gas-app/Engines.gs\nM  gas-app/Code.gs\n?? gas-app/New.gs\n';
  assert.deepEqual(dirtyPaths(status), ['gas-app/Engines.gs', 'gas-app/Code.gs', 'gas-app/New.gs']);
});

test('a rename reports the new path', () => {
  assert.deepEqual(dirtyPaths('R  gas-app/A.gs -> gas-app/B.gs\n'), ['gas-app/B.gs']);
});
