import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorktrees, pickBaseRef } from '../tools/prune-branches.js';

test('parseWorktrees reads path, head, branch and lock state', () => {
  const raw = [
    'worktree /r',
    'HEAD aaa',
    'branch refs/heads/pure-gas-main',
    '',
    'worktree /r/.claude/worktrees/x',
    'HEAD bbb',
    'branch refs/heads/worktree-x',
    'locked',
    '',
    'worktree /r/.claude/worktrees/y',
    'HEAD ccc',
    'detached',
    '',
  ].join('\n');
  assert.deepEqual(parseWorktrees(raw), [
    { path: '/r', head: 'aaa', branch: 'pure-gas-main', locked: false },
    { path: '/r/.claude/worktrees/x', head: 'bbb', branch: 'worktree-x', locked: true },
    { path: '/r/.claude/worktrees/y', head: 'ccc', branch: null, locked: false },
  ]);
});

test('pickBaseRef prefers origin/pure-gas-main, never master', () => {
  assert.equal(pickBaseRef((r) => r === 'origin/pure-gas-main' || r === 'master'), 'origin/pure-gas-main');
  assert.equal(pickBaseRef((r) => r === 'pure-gas-main'), 'pure-gas-main');
  assert.equal(pickBaseRef((r) => r === 'master'), null);
});
